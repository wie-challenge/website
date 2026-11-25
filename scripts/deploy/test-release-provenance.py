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
    invocation=f"https://github.com/{repo}/actions/runs/11/attempts/2"
    cert=invocation
    if "--predicate-type" in cmd:
        if case in {"missing-binding","invalid-binding","untrusted-binding"}: sys.exit(1)
        pred_type=cmd[cmd.index("--predicate-type")+1]
        if case=="wrong-type": pred_type="https://example.invalid/wrong"
        if case=="wrong-binding-invocation": cert=invocation[:-1]+"1"
        pred=dict(schema=2 if case=="wrong-schema" else 1, repository=repo,
                  source_sha=sha, source_ref="refs/heads/main", workflow=".github/workflows/ci.yml",
                  run_id=12 if case=="wrong-binding-run" else 11,
                  run_attempt=1 if case=="wrong-binding-attempt" else 2,
                  artifact_id=56 if case=="wrong-artifact" else 55, artifact_name="production-release-2",
                  zip_digest="sha256:"+"0"*64 if case=="wrong-zip" else os.environ["ZIP"],
                  bundle_sha256="0"*64 if case=="wrong-binding-digest" else os.environ["DIGEST"],
                  size_in_bytes=int(os.environ["SIZE"]))
    else:
        if case in {"unattested", "wrong-signer", "wrong-source"}: sys.exit(1)
        pred_type="https://slsa.dev/provenance/v1"
        pred=dict(runDetails=dict(metadata=dict(invocationId=invocation)))
    def result(value):
        return dict(verificationResult=dict(signature=dict(certificate=dict(runInvocationURI=cert)),
                    statement=dict(predicateType=pred_type,predicate=value)))
    print(json.dumps([result(pred)]+([result({**pred,"artifact_id":57})] if case=="conflicting" else [])))
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
    elif target.endswith("/artifacts/55"):
        if case in {"missing-artifact","api-unavailable"}: sys.exit(1)
        if case=="oversized": print("x"*70000); sys.exit(0)
        if case=="malformed": print("{not json"); sys.exit(0)
        print(json.dumps(dict(id=55,name="production-release-2",expired=case=="expired",
             digest=os.environ["ZIP"],size_in_bytes=int(os.environ["SIZE"]),
             workflow_run=dict(id=12 if case=="another-run" else 11,head_sha=sha,head_branch="main"))))
    else: sys.exit(1)
else: sys.exit(1)
''')
    gh.chmod(0o700)
    cases = ("exact", "in-progress", "modified", "unattested", "wrong-signer", "wrong-source",
             "wrong-repo", "wrong-ref", "stale", "failed-run", "cancelled", "queued",
             "incomplete-required", "incomplete-release", "wrong-attempt", "wrong-job-attempt",
             "failed-required", "skipped-required", "missing-artifact", "api-unavailable", "oversized", "malformed", "expired", "another-run",
             "missing-binding", "invalid-binding", "untrusted-binding", "wrong-type", "wrong-schema",
             "wrong-binding-invocation", "wrong-binding-run", "wrong-binding-attempt", "wrong-artifact",
             "wrong-zip", "wrong-binding-digest", "conflicting")
    for case in cases:
        env = dict(os.environ, PATH=f"{d}:{os.environ['PATH']}", CASE=case, SHA=sha,
                   ZIP="sha256:"+hashlib.sha256(archive.read_bytes()).hexdigest(),
                   DIGEST=digest, SIZE=str(archive.stat().st_size))
        r = subprocess.run(["bash", str(verifier), str(bundle), sha,
                            "0"*64 if case=="modified" else digest],
                           env=env, capture_output=True, timeout=15)
        assert (r.returncode == 0) == (case in {"exact","in-progress"}), (case, r.stderr)
        print(case, "passed")
