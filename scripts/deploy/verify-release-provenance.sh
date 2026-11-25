#!/usr/bin/env bash
# Standalone D5 verifier. Keep disabled in the live helper until qualification.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
repo=wie-challenge/website
token=/etc/nasj/github-provenance.token
[[ -f $token && ! -L $token && $(stat -c '%u:%g:%a' "$token") == 0:0:600 ]]
IFS= read -r GH_TOKEN <"$token"
[[ $GH_TOKEN =~ ^[A-Za-z0-9_]+$ ]]
export GH_TOKEN
main_matches() {
  local head
  head=$(timeout 20 gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)
  [[ $head == "$1" ]]
}
if [[ $# == 2 && $1 == --main-head && $2 =~ ^[a-f0-9]{40}$ ]]; then
  main_matches "$2"
  exit
fi
[[ $# == 3 && $2 =~ ^[a-f0-9]{40}$ && $3 =~ ^[a-f0-9]{64}$ ]]
[[ -f $1 && ! -L $1 ]]
bundle=$1 sha=$2 digest=$3
actual=$(sha256sum <"$bundle")
[[ ${actual%% *} == "$digest" ]]
verified=$(timeout 60 gh attestation verify "$bundle" --repo "$repo" \
  --signer-workflow "$repo/.github/workflows/ci.yml" \
  --source-ref refs/heads/main --source-digest "$sha" --deny-self-hosted-runners --format json)
main_matches "$sha"
# Match the artifact attached to the signed attempt, not a runner assertion.
archive_matches() (
  set -e
  local run=$1 attempt=$2 dir record id outer
  record=$(timeout 20 gh api "repos/$repo/actions/runs/$run/artifacts" |
    jq -er --arg name "production-release-$attempt" '
      [.artifacts[] | select(.name==$name and .expired==false)] |
      select(length==1) | .[0] | [.id,.digest] | @tsv')
  read -r id outer <<<"$record"
  [[ $id =~ ^[0-9]+$ && $outer =~ ^sha256:[a-f0-9]{64}$ ]]
  dir=$(mktemp -d)
  trap 'unlink "$dir/archive.zip"; rmdir "$dir"' EXIT
  timeout 300 gh api "repos/$repo/actions/artifacts/$id/zip" |
    head -c 1073741825 >"$dir/archive.zip"
  [[ $(stat -c %s "$dir/archive.zip") -le 1073741824 ]]
  printf '%s  %s\n' "${outer#sha256:}" "$dir/archive.zip" | sha256sum -c --status -
  python3 - "$dir/archive.zip" "$digest" <<'PYTHON'
import hashlib, sys, zipfile
path, expected = sys.argv[1:]
with zipfile.ZipFile(path) as z:
    entries = z.infolist()
    if sorted(i.filename for i in entries) != ["release.sha256", "release.tar.gz"]:
        raise SystemExit(1)
    if not (0 < z.getinfo("release.tar.gz").file_size <= 1073741824
            and z.getinfo("release.sha256").file_size == 65):
        raise SystemExit(1)
    if z.read("release.sha256") != (expected + "\n").encode():
        raise SystemExit(1)
    with z.open("release.tar.gz") as f:
        if hashlib.file_digest(f, "sha256").hexdigest() != expected:
            raise SystemExit(1)
PYTHON
)
invocations=$(jq -er '.[].verificationResult.statement.predicate.runDetails.metadata.invocationId | strings' <<<"$verified")
while IFS= read -r invocation; do
  [[ $invocation =~ ^https://github.com/wie-challenge/website/actions/runs/([0-9]+)/attempts/([0-9]+)$ ]] || continue
  run=${BASH_REMATCH[1]} attempt=${BASH_REMATCH[2]}
  timeout 20 gh api "repos/$repo/actions/runs/$run/attempts/$attempt" |
    jq -e --arg sha "$sha" --arg repo "$repo" --argjson run "$run" --argjson attempt "$attempt" '
      .id==$run and .run_attempt==$attempt and .head_sha==$sha and
      .head_branch=="main" and .event=="push" and .path==".github/workflows/ci.yml" and
      .repository.full_name==$repo and .head_repository.full_name==$repo and
      ((.status=="in_progress" and .conclusion==null) or
       (.status=="completed" and .conclusion=="success"))' >/dev/null || continue
  timeout 20 gh api "repos/$repo/actions/runs/$run/attempts/$attempt/jobs" |
    jq -e --argjson run "$run" --argjson attempt "$attempt" '
      def done($name): [.jobs[] | select(.name==$name)] |
        length==1 and .[0].run_id==$run and .[0].run_attempt==$attempt and
        .[0].status=="completed" and .[0].conclusion=="success";
      done("required") and done("release")' >/dev/null || continue
  # Invoke in a fresh shell with errexit enabled (conditionals disable it).
  archive_matches "$run" "$attempt"
  echo "Verified provenance, artifact and prerequisite CI for $sha (run $run, attempt $attempt)"
  exit 0
done <<<"$invocations"
exit 1
