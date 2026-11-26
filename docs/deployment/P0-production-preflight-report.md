# NASJ P0 Production Activation Preflight

Date: 2026-11-23 (Africa/Tunis). Scope: read-only production inspection, GitHub inspection, and disposable local validation. No production services/configuration/data were changed; no deployment, migration, package installation, push, or merge was performed. The worktree already contained extensive user changes; this report does not treat earlier reports as evidence.

## Verdict

**NO-GO for P1 production activation.** There are high-severity deployment-boundary flaws to fix and revalidate, and key operational prerequisites remain unverified: privilege separation, off-host backup/restore, hosted workflow success for the current pipeline, GitHub branch protection, and live rollback. Production is currently healthy and untouched.

## 1. Current infrastructure inventory

| Area | Verified observation |
|---|---|
| VPS | `nasj` SSH alias -> `ubuntu@197.5.133.46:22`; Ubuntu 24.04.5, x86_64, 2 vCPU, 3.8 GiB RAM, 65 GiB free of 77 GiB disk. Read-only SSH command succeeded. |
| Applications | `nasj-api`, `nasj-web`, `nasj-worker` active; all run as `nasj`. API uses `/srv/nasj/.env`; web listens 127.0.0.1:3000; API 127.0.0.1:3001. Existing `/srv/nasj` is a real directory; `/srv/nasj/app` empty. |
| Database | PostgreSQL 16.15, cluster `16/main`, data `/var/lib/postgresql/16/main`, `listen_addresses=localhost`, port 5432. No database contents or credentials were read. |
| Ingress/TLS | Nginx config test succeeded. Nginx listens on 80/443, proxies app loopback. `nasj-platform.ddns.net` HTTPS ready endpoint returned ready in prior independently rechecked read-only inspection. Certbot timer active. |
| Host firewall | UFW reports inactive. Provider firewall policy cannot be inspected through VPS SSH; public listener exposure beyond host is unverified. |
| SSH | Effective settings: password auth no, pubkey yes, root without-password, TCP/agent forwarding enabled globally, no forced command globally. New deployment account/key is not installed on VPS. |
| Backups/monitoring | No NASJ backup timer/service or dedicated monitoring/restore mechanism found. Only OS/package and Certbot timers observed. Existing `/srv/nasj-previous-*` are not verified backups. No off-host DB recovery evidence. |
| Runtime environment | `/srv/nasj/.env` exists mode 0640, owner UID 1000/group 988. Only key names and metadata were inspected, not values. Migration file privilege/DB-role separation could not be confirmed. |

## 2. GitHub qualification

Repository `wie-challenge/website` is PRIVATE, default branch `main`. Production Environment exists, custom branch policy limits deployment to `main`; variables `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `PRODUCTION_URL` exist. `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` exist; values were not read. The SSH key is dedicated, but its public half has not been installed on the host, and configured user `nasj-deploy` does not exist there. Thus the job cannot currently authenticate successfully.

Latest GitHub runs observed include a successful `Checks` push for main at 20:15 UTC, but the latest runs predate/are not proof for the current uncommitted deployment workflow. No current release/deployment run proves hosted qualification. A Dependabot PR run failed; no current run details were used to infer code correctness.

GitHub API rejected branch protection with HTTP 403: private repositories need GitHub Pro or public visibility for this feature. Keep repo private. Secure options: upgrade plan and enforce required PR reviews/status checks; alternatively host the source on a private plan that supports required protections. Environment branch restrictions alone do not require review and do not protect workflows/main from direct pushes. Do not activate CD without a branch integrity control.

Workflow structure inspected: `ci.yml` waits for reusable `checks` and `application`; release requires aggregate success on main push. Deploy consumes the uploaded artifact ID and expected hash. This avoids deploying a mutable branch reference. However, current changes are uncommitted and workflow-level safety findings below mean deployment must remain disabled.

## 3. Findings

### P0-01 — Root helper trusts deployment-user-controlled configuration

- **Severity:** Critical
- **Evidence:** `scripts/deploy/deploy.sh` sources `$NASJ_CONFIG_DIR/deploy.conf` before validating its ownership/mode or forcing a root-only path. It initializes `config_dir=${NASJ_CONFIG_DIR:-/etc/nasj}` from inherited environment. The forced SSH wrapper invokes `sudo -n /usr/local/sbin/nasj-deploy ...`; sudoers proposal allows wildcard arguments and does not clear `NASJ_CONFIG_DIR`, `NASJ_STATE_DIR`, `NASJ_LOG_DIR`, `NASJ_EXTRACTOR` or other environment overrides.
- **Affected:** sudo escalation boundary; forced SSH deploy; root helper.
- **Impact:** If these variables can pass sudo policy, the SSH principal can point root at attacker-controlled config or helper paths; root may source shell commands. Validate actual sudo env policy and remove the ambiguity before any key is installed.
- **Remediation:** Hardcode trusted paths in root helper or use `env -i` in root-owned wrapper; set explicit sudo `NOSETENV`, use exact fixed sudo command/validated args; validate root ownership/modes of every config/helper/parent; ensure deploy account cannot write any parent path. Add tests for env injection.
- **Verification:** From an unprivileged account, attempt each override through actual sudo policy; every override rejected and root command uses only root-owned fixed paths.

### P0-02 — Archive links can redirect writable cache/config links outside release

- **Severity:** Critical
- **Evidence:** Extractor uses `tarfile.extractall(filter="data")`; this filter prevents escaping links but permits safe in-tree symlinks. The helper then creates `apps/web/.next/cache` with `install -d -o nasj`, following any preexisting archive symlink. A crafted archive can make `cache` point to another in-release location; ownership change may make shipped code/data writable by `nasj`. It also creates `.env` symlink without rejecting an archive-provided `.env` first as a full path check; tar duplicate entries/ancestor symlink cases need explicit rejection. Extractor checks only a subset of critical directory symlinks after extraction.
- **Affected:** Archive extraction, runtime credential boundary and release immutability.
- **Impact:** A malicious artifact (or compromised main workflow) may arrange writable code/config paths or cause symlink-following operations. SHA-256 authenticates transfer but does not establish artifact safety.
- **Remediation:** Reject all symlinks/hardlinks for deployment bundle (or strict explicit link allowlist), reject duplicate names and any symlink ancestor, ensure `.env`/cache targets are newly created and verified regular/directory with no symlink before chown/install. Add adversarial archive tests and inspect tar members before any writes.
- **Verification:** Symlink, hardlink, duplicate member, ancestor link, cache link, `.env` link and special-file payloads all reject before any destination path is created/modified.

### P0-03 — SSH principal may be given root migration execution via approval gate

- **Severity:** Critical
- **Evidence:** `nasj-deploy` invokes a root helper. The helper accepts a per-SHA approval file and executes a root-owned backup hook, then runs Prisma migration as `MIGRATION_USER`. If migration account is schema owner, malicious SQL shipped in a main-branch artifact executes with DB owner privileges after approval. Branch protection is unavailable, and users with main push rights can generate main artifacts. Approval mechanism is a file on server, but no independent reviewer or GitHub Environment reviewer was verified.
- **Affected:** Main-branch trust, migration approval and DB authority.
- **Impact:** A compromised/unreviewed workflow or authorized main pusher can potentially gain schema-owner DB control and disrupt production data. PostgreSQL superuser separation and SQL review are not proven.
- **Remediation:** Require protected reviewed main and an independent human approval bound to artifact+SQL digest; enforce GitHub Environment reviewers where plan supports; ensure migration role is least-privilege (not superuser/cluster owner), prohibit arbitrary code hooks. Do not automate approval file creation from deployment key.
- **Verification:** Demonstrate unreviewed PR/main commit cannot reach deploy; inspect DB role attributes/grants privately; injected unapproved migration does not run.

### P1-01 — Release link switch is not atomic across filesystem boundary

- **Severity:** High
- **Evidence:** `switch_to` creates temp directory using `${CURRENT_LINK}.switch...` (e.g. `/srv/nasj.switch.*`) and then `mv -Tf` a symlink onto `/srv/nasj`. `/srv/nasj` is on root filesystem; current link target `/srv/nasj-releases` may be another filesystem/mount in future. Rename-over-link must occur on same filesystem, and helper has no check enforcing this. More critically, adoption docs move `/srv/nasj` into `/srv/nasj-releases`, which may cross a mount and fail/lose atomicity assumptions.
- **Impact:** Partial cutover or deployment failure if paths cross mount boundaries.
- **Remediation:** Verify same device for current link parent, release root, and staging; perform temp symlink in same parent filesystem; adoption use copy+verify or same-filesystem move with documented rollback.
- **Verification:** Cross-device setup is rejected before stopping services; same-device switch and interruption tests prove old/new link remains valid.

### P1-02 — Deployment faults after worker stop can leave services partly switched

- **Severity:** High
- **Evidence:** `switched=true` is set before worker stop, which is good for rollback; EXIT handler attempts recovery. However TERM/INT during a running external operation, hard kill/power failure, inability to restart previous worker, or failures inside rollback only log `ROLLBACK_FAILED`; no external alert/paging path is configured. Current fault tests mock `systemctl` and do not simulate SIGKILL/power loss or concurrent deploy.
- **Impact:** Partial outage may persist without immediate operator notification.
- **Remediation:** Add durable deployment state/journal before switch, boot-time/manual recovery detection, alert on nonzero deploy and rollback failure, add concurrent-lock and interruption fault tests. Document recovery based on verified `current` symlink and service states.
- **Verification:** Inject TERM at each transition and concurrent invocations; demonstrate lock serialization and recoverable state after process interruption.

### P1-03 — Checksum is not a provenance signature

- **Severity:** High
- **Evidence:** Artifact checksum is passed from same workflow run as artifact. This detects corruption/tampering after workflow output but not a compromised workflow/action/repository writer who controls both artifact and digest.
- **Impact:** Main workflow compromise can publish a malicious but checksum-consistent bundle.
- **Remediation:** After branch protections, consider GitHub artifact attestations/Sigstore signature verified on host with pinned trust root and repository/workflow/commit identity constraints.
- **Verification:** Altered artifact rejected despite attacker-controlled transport; valid artifact accepted only for approved repo/workflow/ref.

### P1-04 — Backup destination, cost, RPO/RTO and restoration are absent

- **Severity:** High
- **Evidence:** No NASJ backup timer, encrypted off-host target, monitoring or PostgreSQL restore drill found. Current helper refuses pending migrations without a successful backup hook, but there is no hook provisioned.
- **Impact:** Migration approval and disaster recovery cannot be safely enabled; VPS loss risks unrecoverable data.
- **Remediation:** Choose provider/object storage region, encryption/KMS model and budget. Proposed initial policy below; test restores before integrating hook.
- **Verification:** Scheduled encrypted backup; authenticated integrity check; isolated restore with documented measured RPO/RTO; alert on missed backup.

### P2-01 — Host/provider exposure and rollback retention need operational policy

- **Severity:** Medium
- **Evidence:** UFW inactive; provider firewall unknown. Deploy retains every release and does not prune; current bundle ~825 MiB compressed, expanded dependency tree is substantially larger. At observed 65 GiB free several releases fit, but growth and inode use are not monitored.
- **Impact:** Unexpected public exposure or eventual disk exhaustion.
- **Remediation:** Verify provider ingress rules (22 restricted if feasible, 80/443 public, 3000/3001/5432 private); disk alert and reviewed retention policy after backups/rollback policy exist.
- **Verification:** External port scan/provider rule evidence, disk pressure alert and tested pruning of noncurrent/nonprevious releases only.

## 4. Repository/local validation matrix

| Check | Result in this session | Evidence/limit |
|---|---|---|
| `pnpm lint` | Pass, 5 existing warnings | `/tmp/nasj-native-lint-final.log` |
| `pnpm typecheck` | Pass | `/tmp/nasj-native-types-2.log` |
| `pnpm test` | Pass, 282 tests | `/tmp/nasj-native-units-final.log` |
| Main browser suite | Pass, 58 | `/tmp/nasj-fix-e2e-complete.log` |
| Demo browser suite | Pass 15, 1 optional skip | `/tmp/nasj-demo-final.log` |
| PostgreSQL 16.11 integrations | Pass, 222 scenarios | `/tmp/nasj-integration-pg16-final.log`; disposable DB |
| PostgreSQL 17.7 integrations | Pass, 222 scenarios | `/tmp/nasj-integration-pg17-final.log`; disposable DB |
| Native artifact smoke | Pass: migrations/schema/API/web/worker | `/tmp/nasj-native-smoke-final.log`; disposable PG16 |
| Deploy helper fault suite | Pass listed cases | `/tmp/nasj-native-faults.log`; fake service commands, no actual privilege boundary |
| Schema gate | Pass | `/tmp/nasj-native-schema-final.log`; disposable PG |
| actionlint/ShellCheck/zizmor | Pass at local runs | Validate syntax/workflow; no actual GitHub execution |
| Semgrep | **Fail**: 0 findings but 1 rule error | `/tmp/nasj-native-sast-final.log`; cannot qualify gate until rule error fixed |
| Artifact signature/provenance | Not implemented/verified | SHA256 only |
| Adversarial extraction | Partial/fail as a qualification: traversal/env rejected, symlink attacks not covered | Current extraction concern P0-02 |
| Interrupted deployment | Not tested beyond ordinary mocked failures | SIGKILL/power loss absent |
| Concurrent deploy | Not tested | Host flock code present; no parallel fault test |
| Backup hook failure | Mocked failure case passed | No real encrypted backup or restore destination exists |

## 5. Disaster recovery proposal (not activated)

Decision required: choose S3-compatible object storage, region, account owner and monthly budget. Candidate design: PostgreSQL 16 encrypted custom-format `pg_dump` nightly, plus WAL archiving every 5–15 minutes if PITR is required. Use client-side age/KMS envelope encryption before upload; dedicated server credential limited to one bucket/prefix, write-only for backup principal and separate read access for restore. Keep keys outside VPS and GitHub; store recovery key in an organizational vault with two-person access.

Starting retention proposal: 14 daily, 8 weekly, 12 monthly encrypted snapshots; WAL 14 days (only if continuous archive is correctly monitored). Storage estimate: let compressed DB backup size be `B GiB`; full-snapshot upper bound is `34 × B GiB` before deduplication, WAL, versions and provider overhead. Example at B=5 GiB -> 170 GiB upper bound; estimate cost from selected provider/region and current public pricing before approval. Do not claim a specific price until destination is selected.

Initial target proposal: RPO <= 15 minutes with monitored WAL archive (<=24 hours with nightly-only dumps); RTO <= 4 hours for a tested single-database restore, with full VPS rebuild objective separately agreed. Nightly job must alert on missed run, upload, checksum/decrypt validation, retention failure and WAL lag. Weekly isolated restore verification should create a temporary private network/host or disposable PG16, verify migration history, representative row counts and application readiness, then destroy only that isolated environment. Pre-migration hook should create an immediate encrypted dump, upload it off-host, verify object metadata/checksum and run an isolated `pg_restore --list`/restore spot-check before returning success. This does not replace periodic full restore drills.

## 6. Production activation blockers and decisions

1. Fix P0-01 through P0-03 and P1-01 through P1-03; rerun security/adversarial tests.
2. Decide GitHub plan/protected main path while preserving private visibility.
3. Decide whether/how to provision `nasj-deploy` and a least-privilege migration role.
4. Verify runtime vs migration PostgreSQL roles privately (no credential output).
5. Select encrypted backup destination, budget, retention, RPO/RTO and accountable on-call owner; complete restore drill.
6. Approve a maintenance window and one-time adoption of existing real `/srv/nasj` to release symlink layout.
7. Review all pre-existing uncommitted work in this shared worktree before any commit/push.

## 7. Dependency order and proposed P1–P5

- **P1 — Secure code qualification:** remediate critical findings; add adversarial tar, env injection, link, duplicate, concurrency and signal tests; fix Semgrep rule error; review worktree ownership.
- **P2 — Governance:** retain private repo; upgrade/configure protected main, required aggregate check, PR reviews and deployment environment approval; prove unreviewed code is blocked.
- **P3 — Recovery:** choose destination and keys, implement encrypted backups/alerts, perform isolated PG16 restore drills, measure RPO/RTO; validate migration hook failure mode.
- **P4 — Host readiness:** after explicit approval, provision isolated accounts/paths/sudoers/key, verify DB role boundaries and provider firewall. Recheck backups and service health immediately before change.
- **P5 — Controlled activation:** after explicit maintenance authorization, adopt symlink layout, run hosted CI on reviewed commit, deploy one exact artifact, observe readiness/logs, then perform a separately approved rollback drill. Keep rollback app-only for compatible expand/contract migrations.

## Evidence boundaries

VPS facts above came from read-only commands over the existing trusted `nasj` administrator SSH connection; environment secret values and database data were not printed. GitHub secret presence was checked by name only. Provider firewall, database role grants, backup destination, action run for this uncommitted pipeline, and live rollback remain unverified. The local implementation reports and prior generated artifact are not production evidence.
