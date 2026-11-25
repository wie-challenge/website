"""Exercise D5 policy wiring with simulated GitHub CLI responses, not signatures."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    verified = d / "verify.sh"
    source = Path(__file__).with_name("verify-release-provenance.sh").read_text()
    token = d / "token"
    token.write_text("test_token\n")
    token.chmod(0o600)
    verified.write_text(source.replace("export PATH=/usr/sbin:/usr/bin:/sbin:/bin", "")
                        .replace("/etc/nasj/github-provenance.token", str(token))
                        .replace("== 0:0:600", f"== {os.getuid()}:{os.getgid()}:600"))
    gh = d / "gh"
    gh.write_text("""#!/bin/bash
set -eu
case $1 in
  attestation)
    [[ $* == *'--repo wie-challenge/website --signer-workflow wie-challenge/website/.github/workflows/ci.yml --source-ref refs/heads/main --source-digest '* ]]
    [[ $* == *'--deny-self-hosted-runners'* ]]
    case "$CASE" in no-attestation|wrong-repo|wrong-ref|wrong-signer|wrong-source) exit 1;; esac
    printf '{"verificationResult":{"statement":{"predicate":{"runDetails":{"metadata":{"invocationId":"https://github.com/wie-challenge/website/actions/runs/11/attempts/2"}}}}}}' | jq -s .
    ;;
  api)
    case $2 in
      */git/ref/heads/main) [[ $CASE != old-head ]] && echo "$SHA" || printf '%040d\n' 0;;
      */actions/runs/11/attempts/2)
        result=success; [[ $CASE != failed-ci ]] || result=failure
        printf '{"head_sha":"%s","head_branch":"main","event":"push","path":".github/workflows/ci.yml","conclusion":"%s"}\n' "$SHA" "$result"
        ;;
      */actions/runs/11/attempts/2/jobs)
        result=success; [[ $CASE != failed-required ]] || result=failure
        printf '{"jobs":[{"name":"required","conclusion":"%s"},{"name":"release","conclusion":"success"}]}\n' "$result"
        ;;
      *) exit 1;;
    esac
    ;;
  *) exit 1;;
esac
""")
    gh.chmod(0o700)
    bundle = d / "release.tar.gz"
    bundle.write_bytes(b"synthetic artifact")
    sha = "a" * 40
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    for case in ("exact", "modified", "no-attestation", "wrong-repo", "wrong-ref",
                 "wrong-signer", "wrong-source", "old-head", "failed-ci", "failed-required"):
        env = dict(os.environ, PATH=f"{d}:{os.environ['PATH']}", CASE=case, SHA=sha)
        supplied = "0" * 64 if case == "modified" else digest
        r = subprocess.run(["bash", str(verified), str(bundle), sha, supplied],
                           env=env, capture_output=True, timeout=10)
        assert (r.returncode == 0) == (case == "exact"), (case, r.stderr)
        print(case, "passed")
