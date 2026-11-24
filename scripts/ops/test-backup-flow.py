"""Exercise the same-host archive and independent migration backup gates."""

import json
import os
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).with_name("backup.sh").read_text()
for name, release, failure in (
    ("nightly", "nightly", ""),
    ("nightly-neon", "nightly", ""),
    ("migration", "a" * 40, ""),
    ("mount", "nightly", "mount"),
    ("write", "nightly", "write"),
    ("integrity", "nightly", "integrity"),
    ("restore", "nightly", "restore"),
    ("neon", "a" * 40, "neon"),
    ("wrong-receipt", "a" * 40, "wrong-receipt"),
):
    with tempfile.TemporaryDirectory() as path:
        root = Path(path)
        binaries = root / "bin"
        binaries.mkdir()
        state = root / "state"
        state.mkdir()
        store = root / "store"
        store.mkdir(mode=0o711)
        for folder in ("daily", "weekly", "monthly", "pre-migration"):
            (store / "archives" / folder).mkdir(parents=True)
        config = root / "backup.conf"
        config.write_text(
            "BACKUP_DATABASE=demo\n"
            f"NEON_REFRESH_ENABLED={'true' if name == 'nightly-neon' else 'false'}\n"
        )
        config.chmod(0o600)
        bodies = {
            "findmnt": "echo rw,nodev,nosuid,noexec",
            "sha256sum": 'if test "$FAILURE" = integrity && test "$1" = --check; then exit 1; fi; exec /usr/bin/sha256sum "$@"',
            "mountpoint": 'test "$FAILURE" != mount',
            "runuser": """case "$*" in
              *pg_dump*) printf 'synthetic-archive';;
              *pg_virtualenv*) cat >/dev/null
                test "$FAILURE" != restore || exit 1
                echo 'NASJ_EVIDENCE:1:1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';;
              *) exit 2;;
            esac""",
            "age": """if test "$1" = -d; then cat "$4"; else
                test "$FAILURE" != write || exit 1
                cat > "$4"
              fi""",
            "retention": "exit 0",
            "refresh-neon": """cat >/dev/null
                test "$FAILURE" != neon || exit 1
                if test "$FAILURE" = wrong-receipt; then echo stale; exit 0; fi
                printf 'nasj_%s\n' "$(printf '%s' "$1" | tr -d '-' | tr '[:upper:]' '[:lower:]')" """,
        }
        for command, body in bodies.items():
            binary = binaries / command
            binary.write_text("#!/bin/sh\nset -eu\n" + body + "\n")
            binary.chmod(0o755)
        test_script = (
            source.replace("PATH=/usr/sbin:/usr/bin:/sbin:/bin", f"PATH={binaries}:/usr/bin:/bin")
            .replace("$EUID == 0", f"$EUID == {os.getuid()}")
            .replace("== 0:600", f"== {os.getuid()}:600")
            .replace("== 0:711", f"== {os.getuid()}:711")
            .replace('[[ $(stat -c %d "$store") != "$(stat -c %d /var/lib/postgresql)" ]]', ":")
            .replace("/etc/nasj/backup.conf", str(config))
            .replace("/srv/nasj-backups", str(store))
            .replace("/var/lib/nasj-backup", str(state))
            .replace("/usr/local/libexec/nasj-refresh-neon", str(binaries / "refresh-neon"))
            .replace("/usr/local/libexec/nasj-backup-retention", str(binaries / "retention"))
        )
        result = subprocess.run(
            ["bash", "-c", test_script, "nasj-backup", release],
            env={**os.environ, "FAILURE": failure},
            capture_output=True,
            check=False,
        )
        output = result.stdout + result.stderr
        assert (result.returncode == 0) == (not failure), output
        assert (state / "latest").exists() == (failure not in ("mount", "write", "integrity", "restore")), name
        assert (state / "latest-offsite").exists() == (name in ("migration", "nightly-neon")), name
        if (state / "latest-offsite").exists():
            assert json.loads((state / "latest-offsite").read_text())["release"] == release
        assert not list(store.glob(".incoming.*")), name
        print(f"PASS backup flow: {name}")
