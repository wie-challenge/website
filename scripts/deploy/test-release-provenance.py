"""Exercise the D5 run/attempt and artifact policy with simulated GitHub responses."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    token = d / "token"
    token.write_text("test_token\n")
    token.chmod(0o600)
    source = Path(__file__).with_name("verify-release-provenance.sh").read_text()
    verifier = d / "verify.sh"
    verifier.write_text(source.replace("export PATH=/usr/sbin:/usr/bin:/sbin:/bin", "")
                        .replace("/etc/nasj/github-provenance.token", str(token))
                        .replace("== 0:0:600", f"== {os.getuid()}:{os.getgid()}:600"))
    bundle = d / "release.tar.gz"
    bundle.write_bytes(b"synthetic artifact")
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    sha = "a" * 40
    archive = d / "artifact.zip"
    wrong_archive = d / "wrong.zip"
    for path, contents in ((archive, bundle.read_bytes()), (wrong_archive, b"other bytes")):
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("release.sha256", digest + "\n")
            z.writestr("release.tar.gz", contents)
    gh = d / "gh"
    gh.write_text(f"#!{sys.executable}\n" + '''
import hashlib, json, os, sys
from pathlib import Path
case, sha, repo = os.environ["CASE"], os.environ["SHA"], "wie-challenge/website"
cmd = sys.argv[1:]
if cmd[0] == "attestation":
    for opt, val in {"--repo":repo, "--signer-workflow":repo+"/.github/workflows/ci.yml",
                     "--source-ref":"refs/heads/main", "--source-digest":sha}.items():
        assert cmd[cmd.index(opt)+1] == val
    assert "--deny-self-hosted-runners" in cmd
    if case in {"unattested", "wrong-signer", "wrong-source"}: sys.exit(1)
    print(json.dumps([dict(verificationResult=dict(statement=dict(predicate=dict(
        runDetails=dict(metadata=dict(invocationId=f"https://github.com/{repo}/actions/runs/11/attempts/2"))))))]))
elif cmd[0] == "api":
    target = cmd[1]
    if target.endswith("/git/ref/heads/main"):
        print("0"*40 if case=="stale" else sha)
    elif target.endswith("/runs/11/attempts/2"):
        status, conclusion = {"in-progress":("in_progress",None),
            "incomplete-required":("in_progress",None), "incomplete-release":("in_progress",None),
            "failed-run":("completed","failure"), "cancelled":("completed","cancelled"),
            "queued":("queued",None)}.get(case, ("completed","success"))
        print(json.dumps(dict(id=11,run_attempt=1 if case=="wrong-attempt" else 2,
            head_sha=sha,head_branch="other" if case=="wrong-ref" else "main",event="push",
            path=".github/workflows/ci.yml",status=status,conclusion=conclusion,
            repository=dict(full_name=repo),
            head_repository=dict(full_name="fork/website" if case=="wrong-repo" else repo))))
    elif target.endswith("/runs/11/attempts/2/jobs"):
        jobs=[]
        for name in ("required","release"):
            status, conclusion = ("completed","success")
            if case=="incomplete-"+name: status,conclusion="in_progress",None
            if name=="required" and case in {"failed-required","skipped-required"}:
                conclusion=case.split("-")[0].replace("failed","failure")
            jobs.append(dict(name=name,run_id=11,run_attempt=1 if case=="wrong-job-attempt" else 2,
                             status=status,conclusion=conclusion))
        print(json.dumps(dict(jobs=jobs)))
    elif target.endswith("/runs/11/artifacts"):
        p=Path(os.environ["ARCHIVE"])
        print(json.dumps(dict(artifacts=[] if case=="missing-artifact" else [
            dict(name="production-release-2",id=55,expired=False,
                 digest="sha256:"+hashlib.sha256(p.read_bytes()).hexdigest())])))
    elif target.endswith("/artifacts/55/zip"):
        sys.stdout.buffer.write(Path(os.environ["ARCHIVE"]).read_bytes())
    else: sys.exit(1)
else: sys.exit(1)
''')
    gh.chmod(0o700)
    cases = ("exact", "in-progress", "modified", "unattested", "wrong-signer", "wrong-source",
             "wrong-repo", "wrong-ref", "stale", "failed-run", "cancelled", "queued",
             "incomplete-required", "incomplete-release", "wrong-attempt", "wrong-job-attempt",
             "failed-required", "skipped-required", "missing-artifact", "wrong-artifact-bytes")
    for case in cases:
        env = dict(os.environ, PATH=f"{d}:{os.environ['PATH']}", CASE=case, SHA=sha,
                   ARCHIVE=str(wrong_archive if case=="wrong-artifact-bytes" else archive))
        r = subprocess.run(["bash", str(verifier), str(bundle), sha,
                            "0"*64 if case=="modified" else digest],
                           env=env, capture_output=True, timeout=15)
        assert (r.returncode == 0) == (case in {"exact","in-progress"}), (case, r.stderr)
        print(case, "passed")
