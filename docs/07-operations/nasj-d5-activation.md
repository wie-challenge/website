# NASJ D5 qualification and activation proposal

Review draft PR #262 (`infra/nasj-attestation-qualification`, `a290d93`).
The code and test evidence are reviewable, but this is not an approval to
activate automatic production deploys. Positive protected-main delivery on
a disposable host is still required.

The isolated signing workflow (run 45590998432) verified an actual GitHub
signature and rejected a modified fixture and wrong ref. The completed-run
artifact gate accepted exact GitHub metadata and the preserved ZIP locally
and rejected a wrong SHA. The host policy tests also covered missing or
wrong provenance, superseded SHA, failed CI, lock contention, replay,
interrupted delivery, manual recovery, readiness/worker rollback and
migration approval/backup failures. A synthetic signature is not a
protected-main release test. A process-restart test is not a guest reboot test.

Trusted producer: `wie-challenge/website/.github/workflows/ci.yml`, protected
main push, GitHub-hosted runner, successful exact source run attempt and
required/release jobs. The producer alone has `id-token: write` and
`attestations: write`. Completed-run delivery has only `actions: read`, no
checkout of producer code, no caches or script execution from the ZIP, exact
archive member names, size caps, and both digest checks. Its workflow identity
is validated through the API, not the display name alone. The delivery key
cannot sign or create host approvals. FelCloud verifies provenance with a
separate root-only credential and rechecks current main just before switching.
Only current-main releases are eligible; superseded/out-of-order runs fail
closed. The production Environment currently restricts to main and has no
required reviewer for ordinary deploys. Keep manual migration approval
and the release-bound off-host backup gate.

Reviewed candidate helper checksums (SHA-256):

| Source | SHA-256 |
| --- | --- |
| `scripts/deploy/deploy.sh` | `a1bc34fd25b89c2264a0f62add90e699d3425e67f10eb03b3adf161557ee6643` |
| `scripts/deploy/ssh-command.sh` | `de4f088845942400d89ca091fb99510edb29c0a98df4865af325033975989fde` |
| `scripts/deploy/verify-release-provenance.sh` | `cb7b36580098a43b82092f941ed525faa61d33ea615bfa40521cecc239207cde` |

Qualification still to run: authorize protected-main producer integration
with both switches off; independently verify the real release attestation,
then deliver the exact immutable artifact to a disposable Ubuntu host using
separate credentials. Exercise concurrent/out-of-order work, a reboot after
consuming a claim, interrupted recovery, duplicate delivery and rollback.
Do not add production Environment secrets to any isolated workflow.

After separate installation approval, provision reviewed GitHub CLI and jq
binaries, and a repository-scoped read-only GitHub credential sufficient for
contents/ref, Actions and attestation reads. Store it one-per-line in
`/etc/nasj/github-provenance.token` mode 0600 root:root. Never hand this token
to the delivery job. Under the deployment lock, snapshot the existing two
helpers and their checksums, and use the reviewed Ansible deployment role or
atomic staged installs to put:
- `deploy.sh` at `/usr/local/sbin/nasj-deploy`;
- `ssh-command.sh` at `/usr/local/libexec/nasj-ssh-command`;
- `verify-release-provenance.sh` at `/usr/local/libexec/nasj-verify-release-provenance`.

All helpers must be root:root 0755. Create
`install -d -o root -g root -m 0700 /var/lib/nasj-deploy/provenance-claims`.
Run `bash -n`, verify installed SHA-256, trusted parent modes and health.
Leave `/etc/nasj/enable-attested` absent until activation approval. Keep
the old helper path for separately authorized manual exact-digest rollback.
No SSH reload is expected: the forced command points to an unchanged path.

After separate activation approval, create the root:root 0600
`/etc/nasj/enable-attested` marker under the deployment lock, then set
`PRODUCTION_DEPLOY_ENABLED=true` in GitHub. Use a newly approved,
migration-free main push to exercise the first automatic deployment.
The exact SHA and artifact digest cannot be named until that reviewed push
builds and attests. Observe both jobs, the host replay marker, readiness and
the retained release. Kill switch: unset the GitHub variable and, under the
lock, move the host marker into protected rollback storage. Preserve claims,
pending state, logs and release directories. If needed, restore the saved
helper copies atomically under that lock and follow the documented
application rollback; authorize any intentional older-release recovery
by its exact digest, never by deleting automatic claims.

## Same-run architecture correction

The approved design replaces `workflow_run` entirely. Main CI's delivery
job needs both `required` and `release`, and calls the restricted reusable
deployment workflow with the release job's exact artifact ID and digest.
Signing permissions stay exclusively in the producer. Delivery gets Actions
read only and the production Environment's pinned SSH credential.

The host verifies the signed repository, main ref, workflow, SHA and attempt.
It requires exact successful completed `required` and `release` jobs for that
attempt. It accepts an overall `in_progress` run only with no conclusion and
those completed jobs; completed runs must be successful. It resolves the exact non-expired artifact from the signed binding and
checks GitHub metadata under bounded response limits. Delivery checks the ZIP
and bundle digests; the host checks the received bundle hash and both signatures
without a second ZIP download. Claims remain durable under the existing lock.

Twenty simulated verifier cases and the canonical deployment fault suite
passed locally. They include the in-progress accept/reject distinction,
failed/cancelled runs, skipped gates, wrong job/run attempts, and mismatched
archive content. Hosted PR checks for the corrected head are pending.
A positive real protected-main test and disposable host reboot evidence
remain prerequisites; draft PR CI cannot issue the permitted main-push
attestation. Do not install or activate the code based on local tests alone.

## Signed binding implementation

Protected-main revision `bbdccf07c81394c984abbfe177a18217d1a1435b`,
run 45692827228, produced artifact 15059814960 with SLSA and signed
artifact-binding attestations. Only the release job has signing permissions
and artifact metadata read access for predicate creation. Delivery uses the
exact artifact ID from that release, verifies the ZIP and bundle checksums,
and has Actions read access plus the main-only production Environment.
The production Environment currently has a branch policy only, so a
reviewer does not need to approve ordinary deployment jobs individually.
No install or activation is authorized by this document.

## Qualified signed-binding release and production approval

Disposable restricted delivery and real reboot replay passed on the protected
main revision above. The verified bundle SHA-256 is
`ffb892bffdcd53d59638c8b5f34f3f043b3444b5c1151fb3d74c75cbfa15ba32`.
The guest deployed in 39.2 seconds, compared with the older attempt that
failed after 314.3 seconds. See the qualification report for all metrics.
This supersedes the earlier pending protected-main and reboot checkpoints.

**Approval A: install without activation.** From verified revision
`bbdccf07c81394c984abbfe177a18217d1a1435b`, use the reviewed deployment role
after a scoped check-mode review, or atomically install only the three
helpers listed above under `/var/lib/nasj-deploy/deploy.lock`. Preserve a
root-only snapshot of prior helpers and configuration and compare their
hashes. The new verifier checksum is
`cb7b36580098a43b82092f941ed525faa61d33ea615bfa40521cecc239207cde`.
Ensure gh, jq and Python are trusted and available on the verifier's fixed
system PATH; check GitHub attestation and metadata reads without exposing
the token. Provision a distinct production read-only token at the stated
root-only path; never copy the temporary guest token into production.
Verify the previous active release and services remain healthy. Keep the
host marker absent and both GitHub automation variables unset.

**Approval B: production activation and first automatic deployment.** Review
a new migration-free protected-main change as the proposed first candidate,
confirm the receipt, pinned SSH path and legacy rollback target, then create
the host marker under lock and set `PRODUCTION_DEPLOY_ENABLED=true` only under
explicit approval. The push through protected main will create the exact
artifact and signed binding; record their IDs and verify required jobs and
production readiness. Keep `INFRA_WORKFLOW_ENABLED` unset. If validation fails,
unset the GitHub variable and remove the host marker under lock before any
further attempt; handle pending state under the runbook, preserve claims,
and use exact-digest authorization for any separately approved rollback.

Approval A was executed. Rollback snapshot:
`/root/nasj-d5-install-rollback.LpPF48`. If installation rollback is
authorized, restore the captured prior helper(s) atomically under
`/var/lib/nasj-deploy/deploy.lock` after checking `helpers.sha256`;
compare `config.sha256`, preserve claims/logs, and remove only reviewed
new paths listed in `absent`. Do not delete any consumed claims.
Approval B remains pending. After fresh health/receipt/CI preflight and
separate approval, create the marker under lock:

```bash
sudo flock /var/lib/nasj-deploy/deploy.lock install -o root -g root -m 0600 /dev/null /etc/nasj/enable-attested
gh variable set PRODUCTION_DEPLOY_ENABLED --body true
```

Use the next separately reviewed migration-free push through branch
protection. The first exact SHA, artifact ID and digests are generated by
that push rather than reusing the guest artifact. Watch required and
release checks, both attestations, host claim and health. If activation
fails, `gh variable delete PRODUCTION_DEPLOY_ENABLED`, then move the
marker into protected rollback storage under the deploy lock. Keep
`INFRA_WORKFLOW_ENABLED` unset.

## Controlled retry after the direct SSH delivery correction

The first controlled production attempt ended before SSH authentication.
The runner received empty credentials in the called workflow, despite
the Environment secret names being present. The feature variable was
removed and the root marker archived at `/root/nasj-d5-disarm.O4GjkS`.
The prior release `65ef683` continued serving. Review the updated
qualification report and draft PR #266 at
`1f1e2ef808b239594cc94c1c6981bdb478f68c3c`.

1. With integration approval, mark PR #266 ready and merge it through
   branch protection at the reviewed head. Keep both feature variables
   unset and the host marker absent. Require successful main CI, signed
   release publication, and skipped production delivery after that merge.
2. For a new separately approved activation attempt, prepare a fresh
   documentation-only PR. Confirm the entire live-to-candidate diff is
   migration-free, compare against all 44 applied Prisma checksums, and
   confirm application health, exact installed helper checksums, trusted
   administrator access, rollback availability, a free deployment lock,
   no pending state and a verified off-host receipt under 24 hours old.
3. After the protected PR gate succeeds and the live preflight passes,
   create the root-owned marker under the lock and set the production
   feature variable. Merge the approved PR using exact head matching
   through branch protection. Keep the infrastructure variable unset.

   ```bash
   ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj \
     'sudo -n flock -w 10 /var/lib/nasj-deploy/deploy.lock bash -ec '\''test ! -e /var/lib/nasj-deploy/pending; test ! -e /etc/nasj/enable-attested; install -o root -g root -m 0600 /dev/null /etc/nasj/enable-attested'\'''
   gh variable set PRODUCTION_DEPLOY_ENABLED --body true --repo wie-challenge/website
   gh pr merge "$reviewed_pr" --merge --match-head-commit "$reviewed_sha" --repo wie-challenge/website
   ```

4. Capture main run/attempt, completion of required and release jobs,
   exact artifact and both digests, successful credential preflight and
   host verification while the originating run is in progress. Confirm
   readiness, digest and immutable claim, previous release and no
   pending or migration state. Record host authorization time, total
   deployment time and public readiness samples.
5. On failure immediately delete `PRODUCTION_DEPLOY_ENABLED`, archive
   the marker as root under the deployment lock, and confirm the active
   release, recovery state and service health. Preserve logs and claims.

   ```bash
   gh variable delete PRODUCTION_DEPLOY_ENABLED --repo wie-challenge/website
   ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj 'sudo -n flock -w 900 /var/lib/nasj-deploy/deploy.lock bash -ec '\''if [[ -e /etc/nasj/enable-attested ]]; then d=$(mktemp -d /root/nasj-d5-disarm.XXXXXX); mv -- /etc/nasj/enable-attested "$d/"; fi'\'''
   ```

The correction is integrated as `7d0d5422b817cd583995aac35eb8aecc7f4c7f09`.
The exact updated retry candidate is draft PR #267 at
`b12ad36bd8f961a415bee3d1d445240d8e737a2d`. Before the commands in step 3,
verify the exact reviewed head again and recheck current main, both feature
variables, the host marker and the host preflight from step 2. Set
`reviewed_pr=267` and `reviewed_sha=b12ad36bd8f961a415bee3d1d445240d8e737a2d`
and mark the PR ready after approval. Cancel the activation sequence and
run both kill switches if enabling the feature variable or merging fails.

The current rollback target for the retry is the production release
`/srv/nasj-releases/65ef68340f26f9c90af5f90cefdfe28a92f75751`. After
any failed run and disarm, verify automatic rollback or the unchanged
release with these read-only commands:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj \
  'sudo -n flock -n /var/lib/nasj-deploy/deploy.lock bash -ec '\''test ! -e /var/lib/nasj-deploy/pending; test ! -e /etc/nasj/enable-attested; test "$(readlink -f /srv/nasj)" = /srv/nasj-releases/65ef68340f26f9c90af5f90cefdfe28a92f75751; systemctl is-active nasj-api nasj-web nasj-worker postgresql nginx'\'''
curl -fsS --max-time 10 https://nasj-platform.ddns.net/api/health/ready
```

If the active path differs or the pending marker remains, keep CD
disabled, preserve the full protected deployment log and claim, and
use the interrupted-switch recovery procedure in the deployment runbook.

## Production acceptance

PR #267 merged as `a8b5a216e8cd850a72a0995ed3659825229806b5`
after a fresh verified Neon recovery point was established. Main run
45713257601, attempt 1, deployed artifact 15068064854 successfully.
The direct job passed its credential preflight and the production host
verified both attestations during that same in-progress workflow.
The live release passed schema and readiness checks. The prior
`65ef683` release is retained for rollback.

D5 remains enabled at both gates. The kill-switch and recovery commands
above remain applicable. Keep `INFRA_WORKFLOW_ENABLED` unset pending
independent D6 approval. The disposable GitHub qualification token may
now be revoked. Retain the distinct active production verifier token.

## Production verifier credential renewal

GitHub reported that the production verifier credential expires on
25 December 2026 at 21:51:53 Tunisia time (20:51:53 UTC). Renew it by
18 December. This token is separate from the protected Environment SSH
key and pinned host keys. Expiry blocks provenance verification for new
deployments while the active release keeps serving.

1. In GitHub, create a fine-grained token scoped to `wie-challenge/website`
   with read-only Contents, Actions and Attestations. Record its expiration
   in the operator credential inventory. Stage the replacement as a local
   file with mode 0600 using a hidden prompt or secure editor.
2. Validate the three reads from a trusted workstation before changing
   FelCloud. Disable shell tracing and keep the token out of command-line
   arguments and logs. With `replacement` set to the staged file path:

   ```bash
   (
     set -e
     export GH_TOKEN
     GH_TOKEN=$(<"$replacement")
     repo=wie-challenge/website
     gh api "repos/$repo/git/ref/heads/main" --silent
     gh api "repos/$repo/actions/runs/45713257601" --silent
     gh api "repos/$repo/attestations/sha256:43423729ee3e87736137ad95feba31e2d07fa6bf783fe92f0c338b9a5cd5562d" --silent
   )
   ```

3. Under an approved rotation window, stream the replacement over strict
   administrator SSH. Validate the staged credential on FelCloud before
   the atomic replacement. The root-only directory retains the old token
   for controlled recovery.

   ```bash
   ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj \
     'sudo -n flock -w 60 /var/lib/nasj-deploy/deploy.lock bash -ec '\''
       umask 077
       repo=wie-challenge/website
       dest=/etc/nasj/github-provenance.token
       stage=$(mktemp /etc/nasj/.github-provenance.XXXXXX)
       trap "rm -f -- \"$stage\"" EXIT
       cat > "$stage"
       test -s "$stage"
       export GH_TOKEN
       GH_TOKEN=$(cat "$stage")
       /usr/bin/gh api "repos/$repo/git/ref/heads/main" --silent
       /usr/bin/gh api "repos/$repo/actions/runs/45713257601" --silent
       /usr/bin/gh api "repos/$repo/attestations/sha256:43423729ee3e87736137ad95feba31e2d07fa6bf783fe92f0c338b9a5cd5562d" --silent
       unset GH_TOKEN
       saved=$(mktemp -d /root/nasj-verifier-rotation.XXXXXX)
       install -o root -g root -m 0600 "$dest" "$saved/github-provenance.token"
       chown root:root "$stage"
       chmod 0600 "$stage"
       mv -T "$stage" "$dest"
       stat -c "%U:%G %a" "$dest"
       printf "Rotation recovery directory: %s\n" "$saved"
     '\''' < "$replacement"
   ```

4. Verify the root-owned 0600 file and confirm the next approved delivery
   can verify provenance. If a regression requires reversal before the prior
   token is revoked, stage the saved file in `/etc/nasj` as root:root 0600
   and atomically restore it with `mv -T` under the deployment lock. After
   verification, revoke the previous token in GitHub, remove its local and
   host recovery copies, and record the replacement's expiration. Retain
   the production SSH Environment credentials through this token rotation.

## Emergency disablement and intentional rollback

Disable the repository switch first, then acquire the host lock to archive
the marker. If GitHub is unavailable, proceed with the host command and
retry the repository disablement independently. The lock allows any active
deployment to reach a stable state before the marker is removed.

```bash
gh variable delete PRODUCTION_DEPLOY_ENABLED --repo wie-challenge/website
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj \
  'sudo -n flock -w 900 /var/lib/nasj-deploy/deploy.lock bash -ec '\''if test -e /etc/nasj/enable-attested; then d=$(mktemp -d /root/nasj-d5-disarm.XXXXXX); mv -- /etc/nasj/enable-attested "$d/"; echo "$d"; fi'\'''
```

Check `readlink -f /srv/nasj` and root-only `current`, `previous`,
`pending` and release logs in `/var/lib/nasj-deploy`. If the deploy helper
already restored a healthy release, record it and stop. For an intentional
rollback, first verify schema compatibility, the recorded previous SHA and
digest, and the exact archived bundle. With no pending deployment, use the
approved exact-digest manual authorization and the existing forced-command
entry point. In the administrator shell, create the root authorization
under the lock using the reviewed values. From the workstation use the
verified rollback artifact:

```bash
[[ "$rollback_sha" =~ ^[a-f0-9]{40}$ && "$rollback_digest" =~ ^[a-f0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$rollback_digest" "$verified_bundle" | sha256sum --check --status || exit 1
printf 'sha256:%s\n' "$rollback_digest" | ssh -o BatchMode=yes \
  -o StrictHostKeyChecking=yes nasj \
  "sudo -n flock /var/lib/nasj-deploy/deploy.lock install -o root -g root -m 0600 /dev/stdin /etc/nasj/releases/$rollback_sha"
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$pinned_known_hosts" -i "$reviewed_deploy_key" \
  "$deployment_target" "deploy $rollback_sha sha256:$rollback_digest" < "$verified_bundle"
curl -fsS --max-time 10 https://nasj-platform.ddns.net/api/health/ready
```

Verify the active link, API, web, worker and PostgreSQL. Archive the
one-time rollback authorization under the deployment lock. Preserve
replay claims. If an interrupted cutover left a pending marker, follow the
locked recovery procedure in [Production deployment and recovery](deployment.md#recovery).
Database schema reversal requires separate review.

At closure the previous release was
`65ef68340f26f9c90af5f90cefdfe28a92f75751`. Its verified bundle is retained
in the private workstation archive `~/.local/share/nasj-d4.khL9ho`.
The bundle SHA-256 is
`33e160c4049e8b6b988c7c0061387cd4832678c96fe83f1aea35feecf9073fa2`.
Compare these values with the live `previous` state when using the procedure,
since later deployments can change the rollback target.
