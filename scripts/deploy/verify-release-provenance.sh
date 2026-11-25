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
  head=$(timeout 20 gh api "repos/$repo/git/ref/heads/main" --jq .object.sha | head -c 42)
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
bounded() {
  local seconds=$1 limit=$2 data
  shift 2
  data=$(timeout "$seconds" "$@" | head -c "$((limit + 1))") || return 1
  [[ ${#data} -le $limit ]] || return 1
  printf '%s' "$data"
}
type=https://github.com/wie-challenge/website/attestations/artifact-binding/v1
verify=(gh attestation verify "$bundle" --repo "$repo"
  --signer-workflow "$repo/.github/workflows/ci.yml"
  --source-ref refs/heads/main --source-digest "$sha" --deny-self-hosted-runners --format json)
verified=$(bounded 60 1048576 "${verify[@]}")
bindings=$(bounded 60 1048576 "${verify[@]}" --predicate-type "$type")
main_matches "$sha"
invocation=$(jq -er '
  [.[] .verificationResult |
   select(.statement.predicateType=="https://slsa.dev/provenance/v1") |
   select(.signature.certificate.runInvocationURI ==
          .statement.predicate.runDetails.metadata.invocationId) |
   .signature.certificate.runInvocationURI | strings] |
  unique | select(length==1) | .[0]' <<<"$verified")
[[ $invocation =~ ^https://github.com/wie-challenge/website/actions/runs/([0-9]+)/attempts/([0-9]+)$ ]]
run=${BASH_REMATCH[1]} attempt=${BASH_REMATCH[2]}
binding=$(jq -ce --arg type "$type" --arg invocation "$invocation" '
  map(.verificationResult) |
  select(length>0 and all(.[]; .statement.predicateType==$type and
      .signature.certificate.runInvocationURI==$invocation)) |
  map(.statement.predicate) | unique | select(length==1) | .[0]' <<<"$bindings")
id=$(jq -er --arg repo "$repo" --arg sha "$sha" --arg digest "$digest" \
  --argjson run "$run" --argjson attempt "$attempt" '
  select(.schema==1 and .repository==$repo and .source_sha==$sha and
         .source_ref=="refs/heads/main" and .workflow==".github/workflows/ci.yml" and
         .run_id==$run and .run_attempt==$attempt and .bundle_sha256==$digest and
         .artifact_name==("production-release-"+($attempt|tostring)) and
         (.zip_digest|test("^sha256:[a-f0-9]{64}$")) and
         (.size_in_bytes|type=="number") and .size_in_bytes>0 and
         .size_in_bytes<=1073741824 and (.size_in_bytes|floor)==.size_in_bytes) |
  .artifact_id | select(type=="number" and .>0 and floor==.)' <<<"$binding")
[[ $id =~ ^[1-9][0-9]*$ ]]
bounded 20 65536 gh api "repos/$repo/actions/artifacts/$id" |
  jq -e --argjson b "$binding" '
    .id==$b.artifact_id and .workflow_run.id==$b.run_id and
    .workflow_run.head_sha==$b.source_sha and .workflow_run.head_branch=="main" and
    .name==$b.artifact_name and .digest==$b.zip_digest and
    .size_in_bytes==$b.size_in_bytes and .expired==false' >/dev/null
bounded 20 262144 gh api "repos/$repo/actions/runs/$run/attempts/$attempt" |
    jq -e --arg sha "$sha" --arg repo "$repo" --argjson run "$run" --argjson attempt "$attempt" '
      .id==$run and .run_attempt==$attempt and .head_sha==$sha and
      .head_branch=="main" and .event=="push" and .path==".github/workflows/ci.yml" and
      .repository.full_name==$repo and .head_repository.full_name==$repo and
      ((.status=="in_progress" and .conclusion==null) or
       (.status=="completed" and .conclusion=="success"))' >/dev/null
bounded 20 262144 gh api "repos/$repo/actions/runs/$run/attempts/$attempt/jobs" |
    jq -e --argjson run "$run" --argjson attempt "$attempt" '
      def done($name): [.jobs[] | select(.name==$name)] |
        length==1 and .[0].run_id==$run and .[0].run_attempt==$attempt and
        .[0].status=="completed" and .[0].conclusion=="success";
      done("required") and done("release")' >/dev/null
echo "Verified provenance, signed artifact binding and prerequisite CI for $sha (run $run, attempt $attempt, artifact $id)"
