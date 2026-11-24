"""Exercise backup failure gates through the shell entry point with disposable adapters."""
import os
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).with_name("backup.sh").read_text()
for failure in ("none", "upload", "integrity", "restore", "neon"):
    with tempfile.TemporaryDirectory() as path:
        root = Path(path)
        binaries = root / "bin"
        binaries.mkdir()
        state = root / "state"
        state.mkdir()
        config = root / "backup.conf"
        config.write_text(
            "BACKUP_DATABASE=demo\nS3_ENDPOINT=https://example.invalid\n"
            "S3_BUCKET=example-bucket\nS3_PREFIX=nasj\nS3_REGION=us-east-1\n"
            f"NEON_REFRESH_ENABLED={'true' if failure == 'neon' else 'false'}\n"
        )
        config.chmod(0o600)
        bodies = {
            "runuser": """case "$*" in
              *pg_dump*) printf 'synthetic-archive';;
              *pg_virtualenv*) cat >/dev/null
                test "$FAILURE" != restore || exit 1
                echo 'NASJ_EVIDENCE:1:1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';;
              *) exit 2;;
            esac""",
            "age": """if test "$1" = -d; then cat "$4"; else cp "$5" "$4"; fi""",
            "aws": """while test "$1" != s3api; do shift; done
                shift
                operation=$1
                shift
                test "$1" = --key
                case "$operation" in
                  put-object) test "$FAILURE" != upload || exit 1
                    mkdir -p "$MOCK_STORAGE/$(dirname "$2")"
                    cp "$4" "$MOCK_STORAGE/$2";;
                  get-object) cp "$MOCK_STORAGE/$2" "$3"
                    if test "$FAILURE" = integrity; then echo tampered >> "$3"; fi;;
                  *) exit 2;;
                esac""",
            "refresh-neon": "exit 1",
        }
        for command, body in bodies.items():
            binary = binaries / command
            binary.write_text("#!/bin/sh\nset -eu\n" + body + "\n")
            binary.chmod(0o755)
        test_script = (
            source.replace("PATH=/usr/sbin:/usr/bin:/sbin:/bin", f"PATH={binaries}:/usr/bin:/bin")
            .replace("$EUID == 0", f"$EUID == {os.getuid()}")
            .replace("== 0:600", f"== {os.getuid()}:600")
            .replace("/etc/nasj/backup.conf", str(config))
            .replace("/var/lib/nasj-backup", str(state))
            .replace("/usr/local/libexec/nasj-refresh-neon", str(binaries / "refresh-neon"))
        )
        result = subprocess.run(
            ["bash", "-c", test_script],
            env={**os.environ, "FAILURE": failure, "MOCK_STORAGE": str(root / "objects")},
            capture_output=True,
            check=False,
        )
        output = result.stdout + result.stderr
        if failure == "none":
            assert result.returncode == 0 and b"NASJ_BACKUP_READY" in output, output
        else:
            wanted_stage = {"integrity": "download"}.get(failure, failure)
            assert result.returncode != 0 and f"stage={wanted_stage}".encode() in output, output
        assert (state / "latest").exists() == (failure in ("none", "neon")), failure
        assert not list(state.glob("work.*")), failure
        print(f"PASS backup flow: {failure}")
