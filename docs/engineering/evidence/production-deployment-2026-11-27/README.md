# Production deployment — 2026-11-27

## Verified outcome

- Source commit: `3df19d9a5522a1161bff08980a4e087453b7dd34`.
- GitHub Actions run: [46069894632, attempt 6](https://github.com/wie-challenge/website/actions/runs/46069894632).
- Attested artifact: `15235543295`, bundle SHA-256 `345d104fe46a1bdda4dd8763ae1ab3616c15be644e5c257e8701520dc1bb575c`.
- Previous release: `ce26278c4311d26479b75e8df710ee36d2f3762b`.
- Live release after deployment: `/srv/nasj-releases/3df19d9a5522a1161bff08980a4e087453b7dd34`.
- Backup hook result: `NASJ_BACKUP_READY`, receipt `20261127T225020Z-443dc058-d4ff-4843-a2a9-ab2db77387db`.
- Schema postflight: `SCHEMA_READY`; no pending marker remained.
- API readiness returned `{"status":"ready"}` locally and publicly. Web returned HTTP 200. API, web, worker, PostgreSQL and Nginx were active.

## Deployment chronology

The first automated attempts stopped before creating a deployment log because
`/etc/nasj` was `root:nasj-staging` mode `0750`; the helper requires root-owned
mode `0711`. The directory was corrected to `root:root` `0711`.

The next attested attempt verified the artifact and reported two pending
migrations: `20261127000100_financial_plan_snapshot` and
`20261127010000_dhmad_payments_infrastructure`. It stopped before backup or
migration because the exact per-release migration approval was absent. No
database migration or release switch occurred during that attempt.

After explicit production approval, the exact artifact digest and
`expand-contract` approval were recorded as root-owned mode `0600` files. The
documented manual deployment path was used because the automated provenance
claim for this source SHA had already been consumed. The backup hook completed
before migration; both migrations applied, the schema check returned ready,
and the release switched successfully. The GitHub run remains marked failed
because its automated deploy step stopped at the migration-approval gate; the
manual deployment of that same attested artifact succeeded afterward.
