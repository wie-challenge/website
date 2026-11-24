# NASJ infrastructure qualification

## Audit and disposition

- **Verified.** The merged production pipeline passed hosted CI and built its native release. The deployment job was skipped. Main has the required aggregate check. The production Environment restricts deploys to main.
- **Verified.** FelCloud is x86-64 Ubuntu with Node 24.20.0 and PostgreSQL 16. API, web, worker, and Certbot timer were active. Nginx syntax validation passed. The server reported 65 GiB free on the release filesystem. UFW was inactive and provider rules remain unverified.
- **Verified recovery evidence.** An initial Neon snapshot was restored back into an isolated PostgreSQL 16 cluster. Neon runs PostgreSQL 18. A matching PostgreSQL 18 export client was required. Live application database settings have remained on FelCloud.
- **Partial.** Runtime and migration role separation exists. Runtime lacks read access to Prisma migration history. The deployment scripts are merged, but the VPS still has its original real application directory and needs production qualification.
- **External.** A dedicated local backup volume, Age key custody, alert routing, and protected infrastructure credentials still need production configuration. No production apply, cutover, scheduled backup, or migration was performed during implementation.

## Architecture and decisions

```mermaid
flowchart LR
  PR[PR and main CI] --> Bundle[Immutable tested artifact]
  Bundle --> Approval[Host SHA and digest approval]
  Approval --> SSH[Restricted deployment key]
  SSH --> Helper[Release helper]
  Infra[Manual infrastructure plan and apply] --> Ansible
  Ansible --> Host[Existing Ubuntu VPS]
  Helper --> Systemd[API, web, worker]
  Systemd --> PG[FelCloud PostgreSQL primary]
  PG --> Dump[Consistent compressed dump]
  Dump --> Encrypted[Age encryption and bounded local archive]
  Encrypted --> Verify[Read back, checksum, PG16 restore]
  Verify --> Neon[Fresh Neon database and evidence check]
  Neon --> Gate[Migration backup gate]
  Gate --> Helper
  Helper --> Rollback[Restore previous app symlink on failure]
  Encrypted --> DR[Recovery host and known-good app release]
```

Ansible installs configuration and canonical scripts. systemd schedules operations and supervises
the application. The production helper owns artifact authorization, switching and rollback.
Continuous delivery builds releases automatically. Production activation still requires host
authorization of the digest. A future automatic authorization design should verify a trusted
build attestation for the artifact, commit, repository, workflow and main ref using an independent
trust root. Transport credentials must never authorize their own uploads. Application rollback
retains the compatible expanded database schema.

Neon refresh creates a uniquely named database and validates migration checksums and every public
table's row count against the verified restore of the same dump. The pointer changes only after
verification. Existing copies and failed candidates are retained for operator review. Use a
dedicated Neon project and a role with CONNECT and CREATE DATABASE. Never configure the production
app to use the recovery endpoint. A portable PostgreSQL 16 archive is the preferred VPS recovery
source. Neon-native exports require a client at least as new as Neon.

## Configuration matrix

| Setting | Location | Purpose and state |
|---|---|---|
| `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` | GitHub production Environment | Exists by name. VPS restricted access still needs qualification. |
| `PRODUCTION_DEPLOY_ENABLED` | GitHub repository variable | Unset during qualification. |
| `INFRA_WORKFLOW_ENABLED` | GitHub repository variable | Unset pending infrastructure workflow qualification. |
| `INFRA_SSH_KEY`, `INFRA_KNOWN_HOSTS`, `INFRA_EXTRA_VARS` | Protected production-infrastructure Environment | Missing. Use a dedicated infrastructure user/key and trusted known_hosts. |
| `ansible_host`, `ansible_user`, `nasj_public_health_url` | Private Ansible extra vars | Supply actual endpoint, account and address. The tracked inventories contain placeholders. |
| `nasj_deploy_config` | Vault vars | Reviewed deploy config from the template. Existing file is preserved. |
| Runtime and migration env files | `/etc/nasj/runtime.env`, `/etc/nasj/migration.env` | Provision privately from the existing config, with separate owner groups. |
| `BACKUP_DATABASE`, `BACKUP_MAX_MIB`, `NEON_REFRESH_ENABLED` | Vault map entry `nasj_backup_files['backup.conf']` | Set the existing database name, archive limit (default 256 MiB), and enable nightly Neon refresh in production. A migration always requires Neon. |
| `nasj_backup_volume_uuid` | Private Ansible extra vars | UUID of a preformatted, capacity-bounded ext4 filesystem. Required for the opt-in mount playbook. No formatting is performed. |
| Age public recipients and restore identity | Vault map entries `backup.recipients`, `backup.identity` | Missing. Keep an independent recovery key copy outside the VPS. The production verifier requires a private identity to check its round trip. |
| `PGHOST`, `PGUSER`, `PGDATABASE=neondb` | Vault map entry `backup-neon.conf` | Existing recovery destination. Direct endpoint and verified TLS required. |
| Dedicated Neon password entry | Vault map entry `backup-neon.pgpass` | Supply securely. Use a database wildcard for newly named candidate databases, restricted to the exact Neon host and role. |
| HTTPS alert target and authentication | Vault map entry `notify.curl` | Missing. Supply a protected curl config with `url` and any auth headers. |

The selected storage is a private encrypted local filesystem at `/srv/nasj-backups`.
A loopback S3 service could reuse the old client abstraction but would add a server,
authentication and lifecycle configuration, a network listener, and resource overhead.
It would share the VPS failure domain either way. The filesystem creates no storage endpoint,
API or administrative interface, and removes the need for AWS credentials. Root owns archive
directories and files. The disposable restore account can write only its private workspace.
Do not configure the proposed port 9000 or buckets.

Use a dedicated, capacity-bounded filesystem with `nodev,nosuid,noexec,nofail`. Prefer a
separate block volume; an existing, fully preallocated image is an alternative only if its
capacity can be reserved without compromising the database filesystem. Never use an
unbounded sparse production file on the database disk. The backup refuses the PostgreSQL
filesystem and refuses to proceed if the mount is absent. The dump streams directly into Age encryption. Encrypted scratch files and temporary restore
clusters use the same bounded mount. The operation requires free space equal to at least six
times the configured per-file limit plus 512 MiB. Start by reserving 8 GiB for the current
small workload, measure growth and increase only after checking host capacity.

Retention treats daily, weekly, monthly and pre-migration archives independently with 30,
84, 183 and 30 days respectively. It considers only complete backup pairs and leaves the
newest verified pair per class. Review incomplete artifacts and obsolete Neon candidates
separately. The Neon refresh never drops a previous recovery database.

**Full VPS loss also loses the local archive history.** Neon is the only off-host database
recovery destination in this design. Its latest verified database is the recovery point.
If both FelCloud and Neon are inaccessible, this setup cannot recover the database. A same-host
receipt never qualifies a migration. The hook creates a new Neon database from the exact
current snapshot, compares restored table and migration evidence, and publishes a release-bound
off-host receipt only on success. Keep the current Neon project and recovery access recorded
outside the VPS. The production PostgreSQL data and Nginx/systemd service lifecycle are
independent of backup mount or Neon failure.

Configure an external heartbeat to detect loss of the host. The local monitor checks TLS,
applications, database, CPU load, memory, disk, local and off-host backup freshness, and
unfinished deployment state. Alerts need an operator-approved destination.

## Ordered operator qualification

From `infrastructure/ansible`, install `requirements.txt` into an isolated Python environment.
Prepare encrypted extra vars via `ansible-vault create /secure/nasj-production.yml`.
Supply the host address and trusted host SSH entry. Keep an independent administrator session and
provider console access before authorizing SSH changes.

```bash
ansible-playbook -i inventories/production/hosts.yml --ask-vault-pass \
  -e @/secure/nasj-production.yml playbooks/audit.yml
ansible-playbook -i inventories/production/hosts.yml --ask-vault-pass \
  -e @/secure/nasj-production.yml playbooks/configure.yml --check
```

1. Reserve and format a dedicated ext4 volume outside the PostgreSQL filesystem. Record its
   UUID. After separate mount approval, run `playbooks/mount-backup.yml` with
   `nasj_confirm_backup_mount=true` and the reviewed UUID. Verify `findmnt /srv/nasj-backups`.
   Review retention, Age key custody, Neon access and the notification route.
2. After explicit production apply authorization, rerun configure with
   `-e nasj_production_apply=true`. Qualify the restricted key and preserved SSH access
   separately before setting `nasj_reload_ssh=true`. Inventory-specific Nginx, TLS and systemd
   configuration remains in place. Do not paste generic replacement files over existing ones.
3. After approving the read grant, run `playbooks/database-grant.yml` with
   `nasj_confirm_database_grant=true` and the verified database/runtime/migration identifiers.
4. Run `playbooks/backup.yml` with `nasj_run_backup=true`. Require
   `NASJ_BACKUP_READY`, a matching local manifest and successful isolated restore. Require a fresh Neon
   receipt and test recovery from that database before enabling deployment. Run the backup twice and validate alarm delivery using a
   separate staging destination before enabling `nasj_enable_backup_timer` and
   `nasj_enable_monitoring`.
5. Review the artifact and approve a maintenance window. Run `playbooks/adopt-release.yml`
   with `nasj_confirm_adoption=true`, then `playbooks/verify.yml`. The adoption script requires
   a fresh verified backup, deployment lock, filesystem and capacity checks. An interrupted
   adoption retains the original and candidate paths in the pending marker.
6. Authorize the reviewed release digest as documented in [the deployment runbook](deployment.md).
   Enable CD only after host qualification, test one compatible release and separately exercise
   rollback. Verify public readiness and worker operations before declaring readiness.

For GitHub infrastructure automation, create the protected Environment and configure review
permissions independently of the application Environment. Run the workflow in plan mode on main,
review its result, then dispatch apply with the successful matching plan run ID. The workflow
runs fresh check mode before apply. Keep the flag unset until the protected Environment and
separate management credentials have been validated. A syntax-valid check run is not an
operational rehearsal.

## Replacement VPS recovery

Use a separate recovery inventory and `playbooks/bootstrap.yml` with
`nasj_confirm_bootstrap=true`. Recreate the approved runtime, migration, and monitoring roles,
and load the off-host copies of the real configuration, pinned Node runtime, trusted SSH host
records, credentials, PostgreSQL extension inventory, and DNS/TLS details. Preserve an off-host
encrypted copy of role grants/settings and archive a known-good application artifact beyond
GitHub Actions artifact expiry. The data backup excludes ownership and ACLs by design.

For complete VPS loss, use the latest verified Neon database. Export with a client matching
Neon and test on disposable PostgreSQL 16 before starting recovery. Create a PostgreSQL 16 custom-format dump from that validated restore for the recovery playbook. If the local archive
volume survived, check the Age archive SHA-256 and decrypt in a protected location. Then run `playbooks/disaster-recovery.yml` against an isolated
recovery inventory, with `nasj_confirm_restore=true`, `nasj_recovery_database=nasj_recovery_drill`, and the protected dump path. Confirm extensions, runtime grants,
application login/read/write smoke behavior and outbox handling before routing traffic. Start
the known-good app and worker only after verifying backup compatibility. Restore DNS, test public
TLS, and resume backups and alerting. Review potential duplicate background work before starting
the worker.

Initial RPO target is 24 hours, subject to successful nightly runs. Full VPS-loss RTO is
unmeasured. Record stage timings in the first replacement-host rehearsal. If lower RPO is
required, add periodic physical base backups and continuous encrypted WAL archiving with
restore-to-time drills. Neon restore history only covers the copy uploaded to Neon.

## Persistent qualification checklist

- [x] Read-only server audit and historical Neon recovery proof.
- [x] Deployment fault suite and disposable PostgreSQL evidence test.
- [x] Ansible syntax and inventory validation on local tooling.
- [x] P0 implementation: same-host archive, retention and independent migration gate.
- [x] P0: Qualify the bounded archive filesystem and mount idempotency in the Ubuntu VM.
- [x] P0: Exercise a real remote refresh against a separate synthetic Neon database or project.
- [x] P0: Validate full local archive pipeline and Ansible idempotency on disposable Ubuntu 24.04.
- [x] P0: Exercise synthetic adoption, restricted SSH deploy, rollback, alert, and recovery in the VM.
- [ ] P0: Qualify dedicated infrastructure and deploy SSH, backup credentials and alerts.
- [ ] P0: Authorize and qualify live backup, restricted access, adoption, first deploy and rollback.
- [ ] P1: Measure full recovery time and archive known-good releases and host config off-site.
- [ ] P2: Automate trusted provenance-based release authorization and evaluate WAL archiving.


## Validation record

| Check | Environment | Expected and observed result | Status |
|---|---|---|---|
| Existing deployment fault suite | Local temporary shell fixtures | Unauthorized artifacts, bad digests, lock contention, signal interruption, backup failures and restart/readiness/worker rollback were handled as expected. | Passed |
| Backup orchestration | Temporary filesystem and fake storage/restore adapters | Nightly and migration success, missing mount, failed write, invalid restore, failed Neon refresh and wrong Neon receipt passed. A same-host receipt alone cannot authorize migration. | Passed |
| Backup evidence | Local isolated PostgreSQL 16 Docker container | Matching restore returned identical evidence. Removing a row changed evidence. An unfinished migration failed the check. | Passed |
| Ansible inventory and syntax | Both checked-in sample inventories | Inventory parsing and playbook syntax completed. | Passed |
| ShellCheck, actionlint, YAML and Ansible lint | Local static checking | Scripts and workflows passed the checks run. | Passed |
| Systemd schedule | Local systemd calendar parser | The daily UTC trigger parsed. | Passed |
| VM boot and dedicated storage isolation | Ubuntu 24.04.5 minimal cloud guest on KVM | Verified image digest, successful cloud-init, pinned host key, separate ext4 archive device and restrictive mount options. | Passed |
| S3 upload and download | Not selected | Local filesystem opens no listener and requires no S3 account. | Not applicable |
| Dedicated volume provisioning and repeat apply | Disposable Ubuntu 24.04.5 guest | The storage role changed 2 tasks then 0 on the second run. UUID-based mount persistence changed 1 task then 0 on the second run. Neither run failed. | Passed |
| Full Ansible configuration idempotency | Disposable Ubuntu 24.04.5 guest | Second configure returned 28 OK, zero changed, and zero failed. | Passed |
| Local encrypted archive, retention and timer | Ubuntu guest, real Age, PostgreSQL 16 and systemd | The service wrote a valid encrypted backup receipt after a real isolated restore, retention kept its pinned pair and removed an expired pair, and the nightly timer scheduled successfully. | Passed |
| Restricted SSH and authorized release lifecycle | Ubuntu guest, synthetic release and real systemd/Nginx/TLS | Arbitrary command rejected, adoption succeeded and repeated cleanly, authorized candidate deployed, and worker failure restored the prior healthy release. | Passed |
| Recovery guard and invalid configurations | Ubuntu guest | A pending marker blocked the next release and was reconciled. Invalid Nginx, systemd and SSH files were rejected without affecting running services. Missing backup mount blocked backup while PostgreSQL still returned the fixture row. | Passed |
| Alert and database recovery | Ubuntu guest, test HTTPS receiver and synthetic database | Alert POST reached the receiver and returned 204. The archive restored into an isolated database and returned the expected fixture row. | Passed |
| Pre-migration off-host failure gate | Ubuntu guest and disposable mock tests | A real local archive with no Neon config failed the migration command and wrote no off-host receipt. Wrong remote receipts and failed refreshes also failed in the mock suite. | Passed |
| Fresh Neon recovery point from the new hook | No synthetic Neon destination connected to the VM | The earlier production Neon copy and independent restore remain valid historical evidence. The new candidate automation has not written to production Neon during this qualification. | Pending |
| Live rollback, artifact deployment, full disaster recovery timing | Production changes not authorized | Perform only after staging qualification and a verified remote recovery point. | Pending |

The application workflow still publishes and verifies the same artifact ID and checksum. Treat
a run that became superseded as a deliberate operator decision. Approve only the intended
reviewed digest, and revoke any unused release authorizations. Reuse the original artifact for
a retry. A rebuilt bundle requires fresh authorization even if its source commit matches.


## Local VM qualification

The development workstation has KVM, 12 logical CPUs, 15 GiB RAM and over 300 GiB
available on its workspace filesystem. Qualification booted a QEMU/KVM Ubuntu 24.04.5
guest with 2 vCPUs,
3 GiB RAM, a 24 GiB sparse OS image and a separate 8 GiB sparse test backup image.
The sparse devices are appropriate for the disposable workstation guest only.
SSH forwards on workstation loopback to guest port 22. The seed injects a unique
host key and the launcher writes a matching known_hosts file. The guest verified a
separate 7.8 GiB-formatted ext4 archive device with all three restricted mount flags.

Download the official Ubuntu 24.04 minimal amd64 cloud image and its SHA256SUMS
over HTTPS and verify the image before launching. Use a private work directory
outside the Git tree:

```bash
python3 -m venv /path/to/private-vm-tools
/path/to/private-vm-tools/bin/pip install -r infrastructure/staging/requirements.txt
/path/to/private-vm-tools/bin/python infrastructure/staging/prepare-vm.py \
  /path/to/verified-ubuntu.qcow2 /path/to/new-private-nasj-vm
```

Wait for `cloud-init status --wait` using the generated admin and pinned host key.
Run `bash infrastructure/staging/qualify-vm.sh /path/to/new-private-nasj-vm` from the
repository root. The harness provisions Ubuntu, configures twice, checks restricted SSH,
and exercises TLS health, Age archive recovery, retention, alerts, adoption, a synthetic
artifact switch and rollback, the recovery marker, and missing-mount handling. It uses a synthetic receipt only
after proving that a local archive does not pass the migration gate. A synthetic Neon branch/project and credential are required
for real remote integration. Never use the production recovery copy for fault injection.

## Production readiness audit, 2026-11-24

FelCloud still runs the original real release directory. API, web, worker, PostgreSQL,
Nginx and the Certbot timer were active. Nginx configuration validated and public
readiness returned `ready`. Only the 80 GiB VPS disk was visible. `/srv` and
`/var/lib/postgresql` share its root ext4 filesystem with 65 GiB free. No dedicated
backup block device is visible. Prefer requesting a separate volume. An explicitly
reserved, fully preallocated image is an alternative if the provider cannot attach
one and an operator reviews the capacity impact. Never mount an unbounded sparse
image on the production database filesystem.

The runtime and migration DB roles point to the same database and are distinct.
Neither has superuser, database-creation or role-creation rights. Only the migration
role can create in the public schema. The runtime role still needs SELECT on
`public._prisma_migrations`. PostgreSQL reported 19,364,887 bytes in the production
database. The new instrumentation measured a 2,501-byte encrypted synthetic archive in
3 seconds on the guest. The historical production Neon drill did not record archive size or
RTO. The live database size is not an archive measurement. No production dump
was taken for this audit. Existing runtime and migration secret files are 0640 and
0600 respectively and remain in place.

SSH listens on 22, permits public keys, disables password login, and permits public-key
root login and forwarding globally. The dedicated restrictions must be installed and
validated separately. UFW is inactive and the host reported no nftables tables. Provider
firewall controls and out-of-band recovery access still need confirmation. GitHub protects
main with the strict required workflow check and admin enforcement. The production
Environment restricts deployment to main and has the SSH credential entries. The
separate protected infrastructure Environment is absent. Both deployment flags are unset.

### Production storage activation

The separately authorized 20 GiB FelCloud data disk was formatted as ext4 and mounted
persistently by Ansible at `/srv/nasj-backups`. The mounted filesystem had 19 GiB
available with `nodev,nosuid,noexec`; PostgreSQL remained on the original root
filesystem with 65 GiB available. API, web, worker and PostgreSQL were active after
the mount. A subsequent read-only Ansible audit passed. This step did not configure
backup credentials, enable timers or activate deployment.

### Activation preflight follow-up

Base deployment helpers and the scoped sudo rule are installed. PostgreSQL 16.15,
the API, web, worker and Nginx were active. The backup mount remains isolated on
`/dev/vdb`; PostgreSQL is on `/dev/vda1`. The reviewed candidate `d63a7aa` matched
all 44 production migration names and checksums; the fresh audit also found zero
unfinished, non-rolled-back migrations. The migration table still has no explicit
runtime SELECT grant. The dedicated SSH user has no forced command or forwarding
restriction in the effective configuration. Console recovery access is unverified.

The release config and separate runtime and migration env files are absent. The
backup config, Age identity and recipients, direct Neon config and password file,
and alert config are absent. The existing production Neon recovery config is held
privately on the operator workstation. Synthetic Neon config is held separately.
The canonical off-host receipt is absent. Both automation flags remain unset.

### Neon remote qualification and retention

The private synthetic connection is available. Its direct hostname was derived
from the saved pooled URL and checked against the existing recovery hostname before
use. The real Ubuntu guest hook exposed inherited Neon channel binding at the local
peer-authenticated dump. The canonical backup script now clears the inherited
connection settings before the local dump. The retry passed encryption and local
PostgreSQL 16 restore (2,501 bytes, 4 seconds to local publication). A separate
verified-TLS connection probe from the guest timed out; workstation TCP port 5432
was reachable. The subsequent direct TLS guest test qualified the baseline receipt and reverse recovery. No production
database or existing recovery point was modified.

The old production recovery database remains a verified historical copy and was
excluded from testing. To reproduce the test, use a separate direct endpoint with
a role allowed to connect and create databases. On the Ubuntu guest, install the
updated scripts and provide root-only `backup-neon.conf` and
`backup-neon.pgpass` through private Vault vars. Run as guest root:

```bash
bash qualify-neon.sh SYNTHETIC_DIRECT_HOST PRODUCTION_DIRECT_HOST
```

Connectivity follow-up: both the workstation and Ubuntu guest resolved IPv4 and IPv6
addresses and had default routes. Bounded socket probes connected to TCP 5432 on
both address families, but the PostgreSQL SSLRequest (8-byte packet, code 80877103)
received no response within 3 seconds on either machine. Bounded
`openssl s_client -starttls postgres -verify_hostname HOST -verify_return_error`
probes also timed out. The current helper timed out during Neon refresh after
roughly 63 seconds. TLS certificate validation, authentication and SQL were never
reached. The guest NAT alone cannot explain the failure; the upstream cause is
unconfirmed. Do not relax TLS or channel binding.

Independent probes on 2026-11-24 around 20:02 UTC against the direct synthetic
endpoint in AWS `us-east-2`:

| Source | DNS / TCP 5432 | Traditional SSLRequest | Direct TLS with PostgreSQL ALPN | Certificate / hostname | Authentication / SQL |
| --- | --- | --- | --- | --- | --- |
| Workstation | Resolved / connected | Timed out in 6 seconds | TLS 1.3 | Verified | PostgreSQL 18.7 authenticated with channel binding required, executed SQL and confirmed CREATEDB |
| Ubuntu KVM guest | Resolved / connected | Timed out in 6 seconds | TLS 1.3 | Verified | Guest PostgreSQL 18.7 completed a verified remote restore and executed evidence queries |
| FelCloud | Resolved / connected | Negotiated TLS 1.3 | TLS 1.3 | Verified in both modes | Not attempted; credential-free network probe only |

The difference is specific to traditional negotiation over the development network.
Direct TLS and FelCloud's traditional negotiation both work at the transport layer.
The device dropping or withholding the traditional response is still unidentified.
Neon's public status page listed AWS us-east-2 database connectivity as operational
when checked. Account-level compute and access policy were not inspected. No
GitHub runner was configured or supplied with credentials. An independent hotspot
would help isolate the workstation network; current evidence does not justify a
permanent transport change.

GitHub confirmed artifact ID `14918288458`, name `production-release-1`, size
263,566,244 bytes, and the exact reviewed commit. The private workstation copy passed both digest checks and canonical safe
extraction. The extracted manifest confirmed the exact commit, Linux x64 and
Node v24.20.0. ZIP SHA-256: `1a206cbe2fd8a3ef884b60431132fcb04fbd14879185fc58eb8cb401cffc9b18`.
Bundle SHA-256: `1baa090ab7430db0665e0fc5a45c7c5c480ae4a79aa3b246ba871b51329ed5e5`.

The local connection-isolation regression
(`bash infrastructure/staging/check-backup-connection-isolation.sh` as guest root)
passed the real backup and isolated restore with invalid host, port, user, database,
password, service, SSL and PostgreSQL options inherited from the caller.
That local-only test does not generate a fresh off-host verification receipt.

The script requires the separate endpoint, runs the real pre-migration hook against a
synthetic database, checks evidence and the remote receipt, and verifies that a deliberately
invalid candidate has no receipt and cannot replace the local recovery pointer. It retains
both candidates. Export the verified candidate using a PostgreSQL client at least as new
as the remote server. Restore into a disposable PostgreSQL 16 database using the documented
compatibility procedure and compare the evidence and its synthetic fixture row. Record the
actual archive bytes and duration from `latest-offsite` and independently measure the
recovery time. The remote `nasj_recovery_metadata.receipt` table makes the successful
candidate and release association discoverable even if the VPS is lost.

Start with the newest seven verified daily candidates, four weekly candidates, three
monthly candidates, and a pinned known-good point and any release-bound candidates still
needed for an incident. Review database size and Neon plan usage weekly before changing
the policy. Account for full logical copies, Neon history retention, and failed candidates
separately. An operator must independently verify a newer restorable copy and obtain
approval before any deletion. No pruning of Neon databases is automated. Local retention
continues independently. Total VPS loss removes all same-host history.

### Guest remote qualification and transport

The disposable Ubuntu guest now has PostgreSQL 16 for local dump, verification and
restore, plus PostgreSQL 18.7 client tools for remote direct TLS. Installing the
second client exposed an unqualified `pg_restore` invocation: the newer wrapper
sent `SET transaction_timeout` to PostgreSQL 16. The local verifier now uses explicit
PostgreSQL 16 executables. The remote helper defaults to traditional negotiation
using PostgreSQL 16; the test-only `NEON_SSL_NEGOTIATION=direct` configuration
selects PostgreSQL 18. Both paths require hostname and CA verification and channel
binding. There is no automatic fallback.

The canonical guest hook created and verified a 2,501-byte encrypted archive and
published a release-bound Neon receipt in 21 seconds (3 seconds to local
publication). The full test, including a failed candidate with intentionally
mismatched evidence, took 49.7 seconds. The earlier verified receipt remained
unchanged and the failed remote candidate had no receipt. PostgreSQL 18 exported
the verified candidate and disposable PostgreSQL 16 restored and matched its
table and migration evidence in 22 seconds. A repeat with 25,000 additional
synthetic rows produced a 7,415,401-byte encrypted archive; local publication took
3 seconds and the off-host receipt took 103 seconds total (100 seconds after
local publication, including remote creation, transfer, restore and verification).
The full test including failure preservation took 174.1 seconds. CPU time for
the driving shell and children was 1.68 seconds user and 0.34 seconds system;
a sample during the reverse restore showed 343 MiB used in the 3 GiB guest.
The larger reverse restore matched evidence in 198 seconds. Peak memory and
separate upload/verification timings were not measured.
Only synthetic data was used. The read-only production Ansible audit passed
with no changes; the full check-mode plan awaits the production Vault inputs.
The original restricted SSH and activation gates remain unchanged.

For production approval, run the playbooks from `infrastructure/ansible` with the
production inventory and a private Vault file. The approval packages are:

- **A — Infrastructure:** Review `configure.yml --check --extra-vars @VAULT` with
  backup enabled and timer activation off. Apply with
  `-e nasj_production_apply=true` only after consent. Keep SSH configuration and
  reload off until independent console access is verified and the SSH change is
  authorized. Review `database-grant.yml -e nasj_confirm_database_grant=true`
  separately. Only the runtime migration-history SELECT grant is intended.
  Validate services, mount and permissions; preserve prior configuration for
  rollback. The existing 20 GiB disk must not be reformatted.
- **B — Backup qualification:** After approval run
  `backup.yml -e nasj_run_backup=true`, recover the fresh candidate independently,
  compare archive and remote evidence, and verify the canonical receipt is less
  than 24 hours old. Preserve all previous Neon candidates. A failed run or
  mismatched evidence stops activation; it must not be repaired by editing receipts.
- **C — Cutover:** After separate maintenance approval, run
  `adopt-release.yml -e nasj_confirm_adoption=true`; then authorize and deploy the
  digest-bound artifact per the deployment runbook. Verify API, web, worker and
  public HTTPS, and exercise rollback to the retained compatible prior release
  under the deployment lock. Reconcile the release state before enabling CD.
  Schedule and confirm backup and monitoring runs, with separately approved
  activation and flags. No production mutation was executed for this phase.

### Production activation approval steps

1. Review and merge the infrastructure PR after the required aggregate check passes. It includes the reusable infrastructure workflow as well as application and security checks.
2. Authorize the dedicated filesystem. Prepare the approved capacity-bounded ext4 device,
   collect its UUID, and run `mount-backup.yml -e nasj_confirm_backup_mount=true` with the
   UUID in private vars. Verify the mount options and distinct device with `findmnt`.
3. Approve Age key custody, the existing Neon recovery project and its dedicated access role,
   and a production HTTPS alert destination. Enter the encrypted Vault vars privately using
   the configuration matrix. Keep independent access to the recovery key and Neon account.
4. Run `audit.yml` then `configure.yml --check` using those vars. Review the resulting plan.
   After explicit authorization, run configure with `nasj_production_apply=true`. Keep the
   timer and SSH reload booleans off during this first apply.
5. Separately authorize `database-grant.yml -e nasj_confirm_database_grant=true` with the
   verified runtime and migration identifiers. Confirm runtime SELECT and no schema CREATE.
6. Run `backup.yml -e nasj_run_backup=true`, then independently recover the new Neon copy into
   PostgreSQL 16. With explicit backup-write authorization, invoke the installed
   `/etc/nasj/backup-before-migrate FULL_CANDIDATE_SHA` and require the matching local and
   remote receipts. This hook invocation creates a backup only. It does not run migrations.
7. Verify monitor and alert delivery. Approve turning on `nasj_enable_backup_timer` and
   `nasj_enable_monitoring` in a reviewed configure apply. Check `systemctl list-timers`
   and require a successful real scheduled run.
8. Preserve console access. Separately authorize the deploy SSH drop-in, reload and key test.
   Qualify denied arbitrary commands and confirm the independent admin session still works.
9. Authorize the maintenance window and `adopt-release.yml -e nasj_confirm_adoption=true`.
   Run `verify.yml` and retain the original application release.
10. Download the exact reviewed Actions artifact with `gh run download RUN_ID -n ARTIFACT_NAME`.
    Compare its SHA-256 with the reviewed build summary. Write the authorization file as in the
    deployment runbook. With separate deployment approval, send that exact archive through the
    forced SSH command, check API/web/worker and public health, and rehearse app rollback with
    approved compatible releases. Set the CD flag only after these checks pass.
11. Create the separate protected infrastructure Environment with main-only branch restrictions,
    protected approval and its own credentials. Qualify plan mode before any apply dispatch.
    Enable the infrastructure flag only after explicit authorization and that qualification.

No production mutation, off-host write, deployment activation or provider change was made
during this readiness audit.

### Package A preparation

See [Package A](production-package-a.md) for the A1–A4 commands, credentials,
verification and rollback. The workstation has an encrypted Vault starter with
host, UUID, role names, deploy and backup defaults. A dedicated production Age identity and recipient are now in Vault; independent
operator recovery custody remains to be confirmed. The existing production Neon
credential was staged separately from qualification. A read-only verified-TLS
probe confirmed CONNECT and CREATEDB without creating or changing a database.
The approved alert destination, console access and provider firewall review
remain operator inputs. Strict administrator SSH and public HTTPS readiness passed;
the application services and PostgreSQL remained active. No production apply,
database grant, SSH reload, notification or timer activation was performed.

Backup flow (nine scenarios), retention, real PostgreSQL evidence, deployment
faults, forced command rejection, schema gates, and tracked-history secret
scanning passed. The preserved artifact still matches the head of main at this
review; merge the infrastructure-only PR after required CI passes and retain the
reviewed artifact for the separately authorized first cutover.

The Vault-backed production plan with backups enabled completed with 21 OK,
10 predicted changes, 10 skipped, and zero failures. It previewed deploy.conf,
the archive mount-root permission change to 0711, private archive and restore
directories, Age installation with package service autostarts suppressed,
the unprivileged restore account, protected backup settings, canonical scripts,
and inactive systemd units. It did not include the SSH role or alert config.
The separate database-grant dry run passed its assertions and skipped SQL
execution; the live read-only query returned false for both migration-history
SELECT and public-schema CREATE for nasj_app. No grant was executed.

The operator selected Discord for A4. The notifier supports Discord content with
mentions disabled and retains generic HTTPS. Isolated HTTPS mock tests cover both
formats, certificate rejection and retry limits. Discord mode and production
environment are staged in the encrypted Vault; the private webhook URL,
independent Age custody and recovery-console/firewall confirmation are still
required before the combined dry run. No live alerts were sent.
