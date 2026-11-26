#!/usr/bin/env python3
"""Fault-inject the real deployment helper in a temporary, unprivileged sandbox."""

import fcntl
import hashlib
import io
import json
import os
import pwd
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
NEW, OLD = "a" * 40, "b" * 40
NODE = subprocess.check_output(["which", "node"], text=True).strip()
VERSION = subprocess.check_output([NODE, "--version"], text=True).strip()


def archive(extra=None, sha=NEW):
    stream = io.BytesIO()
    files = {
        ".release.json": json.dumps(
            {"sha": sha, "node": VERSION, "platform": "linux", "arch": "x64"}
        ),
        "apps/api/dist/main.js": "",
        "apps/api/dist/jobs/main.js": "",
        "apps/api/scripts/deploy-check-schema.mjs": "",
        "apps/api/prisma.config.ts": "",
        "apps/api/node_modules/prisma/build/index.js": "",
        "apps/web/node_modules/next/dist/bin/next": "",
        "apps/web/.next/BUILD_ID": "test",
    }
    files.update(extra or {})
    with tarfile.open(fileobj=stream, mode="w:gz") as bundle:
        for name, content in files.items():
            item = tarfile.TarInfo(name)
            data = content.encode()
            item.size = len(data)
            bundle.addfile(item, io.BytesIO(data))
    return stream.getvalue()


def case(
    failure="", schema="0", approval=False, backup=False, payload=None, success=False
):
    data = payload if payload is not None else archive()
    digest = hashlib.sha256(data).hexdigest()
    with tempfile.TemporaryDirectory(prefix="nasj-deploy-test-") as scratch:
        root = Path(scratch)
        for name in [
            "bin",
            "config/approvals",
            "config/releases",
            "releases/legacy",
            "state",
            "log",
        ]:
            (root / name).mkdir(parents=True)
        (root / "current").symlink_to(root / "releases/legacy")
        (root / "state/current").write_text("original\n")
        user = pwd.getpwuid(os.getuid()).pw_name
        (root / "config/deploy.conf").write_text(f"""RELEASE_ROOT={root}/releases
CURRENT_LINK={root}/current
RUNTIME_ENV={root}/runtime.env
MIGRATION_ENV={root}/migration.env
RUNTIME_USER={user}
MIGRATION_USER={user}
NODE_BIN={NODE}
PUBLIC_HEALTH_URL=https://nasj.example.com/api/health/ready
LEGACY_SHA={OLD}
""")
        (root / "config").chmod(0o711)
        (root / "config/deploy.conf").chmod(0o600)
        (root / "releases").chmod(0o755)
        scripts = {
            "chown": "#!/bin/sh\nexit 0\n",
            "systemctl": """#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
if [ "$FAILURE" = interrupted ] && [ "$1" = restart ] && [ "$(readlink "$LIVE")" = "$NEW_RELEASE" ]; then kill -TERM "$PPID"; fi
if [ "$FAILURE" = restart ] && [ "$1" = restart ] && [ "$(readlink "$LIVE")" = "$NEW_RELEASE" ]; then exit 1; fi
exit 0
""",
            "curl": """#!/bin/sh
if [ "$FAILURE" = public ] && [ "$(readlink "$LIVE")" = "$NEW_RELEASE" ] && [ "${*#*https://}" != "$*" ]; then exit 1; fi
printf '{"status":"ready"}\n'
""",
            "runuser": """#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
case "$*" in
  *deploy-check-schema.mjs*) [ -e "$MIGRATED" ] && exit 0; exit "$SCHEMA";;
  *'migrate deploy'*) [ "$FAILURE" = migration ] && exit 1; touch "$MIGRATED";;
  *--status*) if [ "$FAILURE" = worker ] && [ "$(readlink "$LIVE")" = "$NEW_RELEASE" ]; then exit 1; fi;;
esac
exit 0
""",
        }
        for name, script in scripts.items():
            path = root / "bin" / name
            path.write_text(script)
            path.chmod(0o755)
        if failure != "unauthorized":
            (root / "config/releases" / NEW).write_text(f"sha256:{digest}\n")
        if approval:
            (root / "config/approvals" / NEW).write_text(
                f"expand-contract {OLD} sha256:{digest}"
            )
        if backup:
            path = root / "config/backup-before-migrate"
            path.write_text(
                "#!/bin/sh\nexit " + ("1" if failure == "backup" else "0") + "\n"
            )
            path.chmod(0o755)
        env = {
            **os.environ,
            "PATH": f"{root}/bin:" + os.environ["PATH"],
            "NASJ_CONFIG_DIR": "/tmp/attacker-config",
            "NASJ_STATE_DIR": "/tmp/attacker-state",
            "NASJ_LOG_DIR": "/tmp/attacker-log",
            "NASJ_EXTRACTOR": "/tmp/attacker-extractor",
            "CALLS": str(root / "calls"),
            "LIVE": str(root / "current"),
            "NEW_RELEASE": str(root / "releases" / NEW),
            "MIGRATED": str(root / "migrated"),
            "FAILURE": failure,
            "SCHEMA": schema,
        }
        supplied_digest = "0" * 64 if failure == "checksum" else digest
        helper = root / "deploy-test.sh"
        source = (HERE / "deploy.sh").read_text()
        source = (
            source.replace("/etc/nasj", str(root / "config"))
            .replace("/var/lib/nasj-deploy", str(root / "state"))
            .replace("/var/log/nasj-deploy", str(root / "log"))
            .replace(
                "/usr/local/libexec/nasj-extract-release.py",
                str(HERE / "extract-release.py"),
            )
            .replace("/usr/local/sbin/nasj-deploy", str(helper))
        )
        source = source.replace(
            "for trusted_path in / /etc /var /var/lib /var/log /usr /usr/local /usr/local/libexec /usr/local/sbin;",
            "for trusted_path in;",
        )
        # The sandbox has its own owner and mock executables.
        source = source.replace("export PATH=/usr/sbin:/usr/bin:/sbin:/bin", "")
        source = source.replace("== 0:755", f"== {os.getuid()}:755")
        source = source.replace("== 0:700", f"== {os.getuid()}:700")
        source = source.replace("== 0 &&", f"== {os.getuid()} &&")
        (root).chmod(0o755)
        source = source.replace("flock -w 900", "flock -w 0")
        helper.write_text(source)
        if failure == "pending":
            (root / "state/pending").write_text("unfinished")
        lock = (root / "state/deploy.lock").open("w")
        if failure == "concurrent":
            fcntl.flock(lock, fcntl.LOCK_EX)
        result = subprocess.run(
            ["bash", str(helper), NEW, "sha256:" + supplied_digest],
            check=False,
            input=data,
            capture_output=True,
            env=env,
        )
        lock.close()
        if failure == "pending":
            assert b"RECOVERY_REQUIRED" in result.stdout
        if failure == "concurrent":
            assert b"DEPLOY_LOCK_TIMEOUT" in result.stdout
        assert (result.returncode == 0) == success, (
            f"rc={result.returncode}\n"
            + result.stdout.decode()
            + result.stderr.decode()
        )
        calls = (root / "calls").read_text() if (root / "calls").exists() else ""
        if success:
            assert (root / "current").resolve() == root / "releases" / NEW
            assert (root / "state/current").read_text().startswith(NEW)
            assert (root / "state/previous").read_text().strip() == str(
                root / "releases/legacy"
            )
        else:
            assert (root / "current").resolve() == root / "releases/legacy"
            assert (root / "state/current").read_text() == "original\n"
            if failure in ["restart", "public", "worker", "interrupted"]:
                assert "ROLLBACK_READY" in result.stdout.decode(), (
                    result.stdout.decode()
                )
            else:
                assert "stop nasj-worker" not in calls
        print(
            "PASS",
            failure
            or (
                "approved migration"
                if schema == "10" and success
                else "schema " + schema
            ),
            success,
        )


case(success=True)
for fault in [
    "checksum",
    "unauthorized",
    "restart",
    "public",
    "worker",
    "interrupted",
    "pending",
    "concurrent",
]:
    case(failure=fault)
case(schema="1")
case(schema="10")
case(schema="10", approval=True)
case(schema="10", approval=True, backup=True, failure="backup")
case(schema="10", approval=True, backup=True, failure="migration")
case(schema="10", approval=True, backup=True, success=True)
case(payload=archive(sha=OLD))
case(payload=archive({"../escape": "bad"}))
case(payload=archive({"apps/api/.env": "bad"}))
# The SSH boundary rejects shell metacharacters before calling sudo.
for command in [
    "",
    "bash",
    f"deploy {NEW} sha256:{'c' * 64}; id",
    f"deploy {NEW} latest",
]:
    result = subprocess.run(
        ["bash", str(HERE / "ssh-command.sh")],
        check=False,
        env={**os.environ, "SSH_ORIGINAL_COMMAND": command},
        capture_output=True,
    )
    assert result.returncode != 0
print("PASS forced SSH command rejection")
