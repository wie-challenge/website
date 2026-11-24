#!/usr/bin/env bash
# Standalone D5 verifier. Keep disabled in the live helper until qualification.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
[[ $# == 3 && $2 =~ ^[a-f0-9]{40}$ && $3 =~ ^[a-f0-9]{64}$ ]]
[[ -f $1 && ! -L $1 ]]
repo=wie-challenge/website
bundle=$1 sha=$2 digest=$3
actual=$(sha256sum <"$bundle")
[[ ${actual%% *} == "$digest" ]]
verified=$(timeout 60 gh attestation verify "$bundle" --repo "$repo" \
  --signer-workflow "$repo/.github/workflows/ci.yml" \
  --source-ref refs/heads/main --source-digest "$sha" --deny-self-hosted-runners --format json)
head=$(timeout 20 gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)
[[ $head == "$sha" ]]
# An attestation alone cannot prove the workflow reached the required gate.
invocations=$(jq -er '.[].verificationResult.statement.predicate.runDetails.metadata.invocationId | strings' <<<"$verified")
while IFS= read -r invocation; do
  [[ $invocation =~ ^https://github.com/wie-challenge/website/actions/runs/([0-9]+)/attempts/([0-9]+)$ ]] || continue
  run=${BASH_REMATCH[1]} attempt=${BASH_REMATCH[2]}
  if timeout 20 gh api "repos/$repo/actions/runs/$run/attempts/$attempt" |
    jq -e --arg sha "$sha" '.head_sha==$sha and .head_branch=="main" and .event=="push" and .path==".github/workflows/ci.yml" and .conclusion=="success"' >/dev/null &&
    timeout 20 gh api "repos/$repo/actions/runs/$run/attempts/$attempt/jobs" |
    jq -e 'any(.jobs[]; .name=="required" and .conclusion=="success") and any(.jobs[]; .name=="release" and .conclusion=="success")' >/dev/null; then
    echo "Verified provenance and required CI for $sha (run $run, attempt $attempt)"
    exit 0
  fi
done <<<"$invocations"
exit 1
