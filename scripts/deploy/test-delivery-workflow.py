#!/usr/bin/env python3
"""Exercise the exact runner shell steps without production credentials."""
import hashlib
import os
import pathlib
import shutil
import subprocess
import tempfile
import textwrap
import zipfile

WORKFLOW = pathlib.Path(".github/workflows/ci.yml").read_text()
DEPLOY = WORKFLOW.split("\n  deploy:\n", 1)[1]
EXPECTED_GATE = (
    "vars.PRODUCTION_DEPLOY_ENABLED == 'true' && "
    "github.event_name == 'push' && github.ref == 'refs/heads/main'"
)


def step(name):
    block = DEPLOY.split(f"      - name: {name}\n", 1)[1].split("      - name:", 1)[0]
    return textwrap.dedent(block.split("        run: |\n", 1)[1])


def run(script, env, error=None):
    result = subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True)
    if error:
        assert result.returncode != 0 and error in result.stderr + result.stdout, result
    else:
        assert result.returncode == 0, result
    return result


assert f"    if: {EXPECTED_GATE}\n" in DEPLOY
assert "    needs: [required, release]\n" in DEPLOY
assert "    if: always()\n" in WORKFLOW.split("\n  required:\n")[1].split("\n  release:\n")[0]
assert "test \"$CHECKS\" = success && test \"$APPLICATION\" = success && test \"$INFRASTRUCTURE\" = success" in WORKFLOW
assert "    environment: production\n" in DEPLOY
assert "      group: nasj-production\n      cancel-in-progress: false\n" in DEPLOY
assert "    timeout-minutes: 30\n" in DEPLOY
assert "    permissions:\n      actions: read\n" in DEPLOY
assert "id-token:" not in DEPLOY and "attestations:" not in DEPLOY
assert DEPLOY.index("Validate production SSH configuration") < DEPLOY.index("Fetch and verify")
assert 'if: always()' in DEPLOY.split("Remove temporary SSH credentials", 1)[1]
ssh = step("Deploy immutable release over pinned SSH")
for option in ("BatchMode=yes", "IdentitiesOnly=yes", "StrictHostKeyChecking=yes",
               "GlobalKnownHostsFile=/dev/null", "deploy-attested "):
    assert option in ssh

with tempfile.TemporaryDirectory() as directory:
    tmp = pathlib.Path(directory)
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", tmp / "fixture"], check=True)
    key = (tmp / "fixture").read_text()
    pin = "[test.invalid]:2222 " + (tmp / "fixture.pub").read_text()
    env = dict(os.environ, RUNNER_TEMP=directory, GITHUB_ENV=str(tmp / "env"),
               DEPLOY_SSH_KEY=key, DEPLOY_KNOWN_HOSTS=pin,
               DEPLOY_HOST="test.invalid", DEPLOY_USER="nasj-deploy", DEPLOY_PORT="2222")
    preflight = step("Validate production SSH configuration")
    cases = [
        ("DEPLOY_SSH_KEY", "", "DEPLOY_SSH_KEY is missing"),
        ("DEPLOY_KNOWN_HOSTS", "", "DEPLOY_KNOWN_HOSTS is missing"),
        ("DEPLOY_SSH_KEY", "invalid private key", "DEPLOY_SSH_KEY is not a valid"),
        ("DEPLOY_KNOWN_HOSTS", pin.replace("test.invalid", "other.invalid"), "DEPLOY_KNOWN_HOSTS has no valid pin"),
        ("DEPLOY_KNOWN_HOSTS", "[test.invalid]:2222 ssh-ed25519 invalid", "DEPLOY_KNOWN_HOSTS has no valid pin"),
        ("DEPLOY_HOST", "-invalid", "DEPLOY_HOST is missing or invalid"),
        ("DEPLOY_USER", "bad user", "DEPLOY_USER is missing or invalid"),
        ("DEPLOY_PORT", "65536", "DEPLOY_PORT is missing or invalid"),
        ("DEPLOY_PORT", "022", "DEPLOY_PORT is missing or invalid"),
        ("DEPLOY_PORT", "2223", "DEPLOY_KNOWN_HOSTS has no valid pin"),
    ]
    for name, value, error in cases:
        result = run(preflight, dict(env, **{name: value}), error)
        if name in ("DEPLOY_SSH_KEY", "DEPLOY_KNOWN_HOSTS") and value:
            assert value not in result.stderr + result.stdout
        assert not list(tmp.glob("nasj-ssh.*"))
    run(preflight, env)
    ssh_dir = pathlib.Path((tmp / "env").read_text().strip().split("=", 1)[1])
    assert (ssh_dir / "key").stat().st_mode & 0o777 == 0o600
    run(step("Remove temporary SSH credentials"), dict(env, NASJ_SSH_DIR=str(ssh_dir)))
    assert not ssh_dir.exists()
    run(preflight, dict(env, DEPLOY_PORT="22", DEPLOY_KNOWN_HOSTS=pin.replace("[test.invalid]:2222", "test.invalid")))

    payload = b"disposable release"
    digest = hashlib.sha256(payload).hexdigest()
    archive = tmp / "fixture.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("release.tar.gz", payload)
        z.writestr("release.sha256", digest + "\n")
    gh = tmp / "gh"
    gh.write_text('#!/bin/bash\ncat "$FIXTURE_ARCHIVE"\n')
    gh.chmod(0o700)
    fetch = step("Fetch and verify exact release ZIP and bundle")
    env.update(FIXTURE_ARCHIVE=str(archive), GITHUB_REPOSITORY="fixture/nasj",
               PATH=f"{tmp}:{env['PATH']}", ARTIFACT="1", BUNDLE_DIGEST=digest)
    zip_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    run(fetch, dict(env, ZIP_DIGEST="0" * 64), "archive.zip: FAILED")
    shutil.rmtree(tmp / "release")
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("release.tar.gz", b"tampered")
        z.writestr("release.sha256", digest + "\n")
    run(fetch, dict(env, ZIP_DIGEST=hashlib.sha256(archive.read_bytes()).hexdigest()),
        "release.tar.gz: FAILED")
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("release.tar.gz", payload)
        z.writestr("release.sha256", digest + "\n")
    shutil.rmtree(tmp / "release")
    run(fetch, dict(env, ZIP_DIGEST=zip_digest))
    assert (tmp / "release" / "release.tar.gz").read_bytes() == payload
print("Delivery workflow regression checks passed")
