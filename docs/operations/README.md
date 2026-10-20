# Operations, backup and recovery

The API emits JSON request logs with random request IDs, normalized endpoint labels, status and duration in milliseconds. Request bodies, cookies, credentials and raw URLs are not logged. Error logs use error type rather than exception message. Worker logs carry event/correlation IDs, state, attempt and execution duration; failures use `LOCAL_CONSUMER_FAILED`. Protect log access: IDs are still personal metadata.

`GET /api/health/live` checks the process. `GET /api/health/ready` executes PostgreSQL `SELECT 1`, returns 503 safely on dependency failure, and does not certify SMTP/Arcjet availability. Run `pnpm worker --status` under trusted operator credentials to see grouped states, oldest pending age and at most 20 failed event IDs. `pnpm ops:check` probes local API readiness and the configured database, emitting fixed alert codes and a nonzero exit on readiness failure, failed outbox work, pending age over five minutes or database unavailability. It is a local check, not a configured paging integration. A supervisor/scheduler must execute it and route the exit/JSON to the operator's alert system.

Start `pnpm worker --watch` for continuous internal receipt delivery. One-shot processing is `pnpm worker --once` (up to 50 events). `pnpm worker --retry-failed EVENT_ID` requeues only a FAILED event and resets its five-attempt budget; investigate first. No public replay/admin endpoint is exposed. Multiple workers use row locks with skip-locked selection. An interrupted DB transaction releases its lock; successful local consumer effects and acknowledgement are atomic. External consumers require their own durable idempotency and must not be inserted into this local transaction handler.

## Backup policy requiring operator review

The following are **proposed**, not approved service guarantees: named deployment owner and backup custodian, nightly encrypted off-host PostgreSQL backups, seven daily/four weekly copies, RPO 24 hours and RTO four hours. Before pilot, the owner must approve targets/retention, access/revocation, encryption keys, storage region, deletion policy and alerts. No off-site storage or scheduled backup service is provisioned by this repository. No private-document storage currently exists; add it and secret-manager recovery to the inventory if deployed. Never store backup archives or secret configuration in Git or CI artifacts.

Use PostgreSQL 17 client tools and protected libpq service/password files (0600), managed separately from source. Example trusted-operator backup procedure; `PGSERVICE` selects the reviewed database and its password never appears in command arguments:

```sh
umask 077
export PGSERVICE=hirfacare_backup
backup_dir=$(mktemp -d /protected/backups/hirfacare.XXXXXXXX)
pg_dump --format=custom --no-owner --no-acl --file="$backup_dir/database.dump"
sha256sum "$backup_dir/database.dump" > "$backup_dir/database.sha256"
```

Use an existing private, access-controlled `/protected/backups` mount, then encrypt and copy the archive/checksum through your approved storage system. A local plaintext copy with mode0600 is not an encrypted off-site backup. Verify backup exit status, byte size and checksum; alert on missed schedule and perform periodic full restores.

Restore **only into a new isolated database** using a separately reviewed libpq service. Stop any workers/API on the target and confirm the service points at the disposable/recovery target. Example:

```sh
export PGSERVICE=hirfacare_isolated_restore
sha256sum --check "$backup_dir/database.sha256"
pg_restore --exit-on-error --no-owner --no-acl --dbname="service=$PGSERVICE" "$backup_dir/database.dump"
```

This procedure expects an empty target. Never run `--clean`, schema resets or test helpers against production. Reconcile counts, stable ordered row hashes, migration history, capacity revisions, command outcomes, audit/outbox pairs and receipts. Use isolated SMTP, block external integrations, probe readiness, then test synthetic access and scoped denials. Review retained auth sessions before making restored data available: old sessions/tokens can be resurrected by restoring historical identity data. Rotate/revoke according to the incident plan. Record measured recovery time separately from target approval.

The executable integration drill in `apps/api/test/restore.scenarios.ts` accepts only a test-harness container name, dumps populated synthetic PostgreSQL, creates a second disposable target, restores with fail-fast checking, and compares every public table's row count and content hash (including migration, identity, audit, command/outbox/receipt data). Files use a private temp directory and 0600 archive, and containers/archive are removed in finally blocks. Timings in `../engineering/E16_TEST_RESULTS.md` are local observations, not production RTO/RPO evidence or commercial ledger reconciliation.

## Incident and rollback

For 503 or database alerts, check PostgreSQL availability/capacity and migration state before restarting apps. Use request/event IDs to correlate safe logs. For FAILED jobs inspect fixed code/version and consumer code, repair, then replay a selected event; verify exactly one receipt. Lag with no failures usually means a stopped or undersized worker. Do not clear the queue/outcome ledger to resolve an alert. Preserve audit history.

For application regression, stop the worker, return to the preceding compatible API/web build and preserve additive reliability tables. Migration failure: inspect `_prisma_migrations`, preserve a backup, repair the cause and use reviewed Prisma resolve/deploy procedures; never assume a failed migration is safe to rerun. Data loss requires isolated restore verification and explicit operator cutover. Alert routing, off-site recovery, real SMTP/Arcjet outages, kill-process recovery and production incident drills remain unverified.
