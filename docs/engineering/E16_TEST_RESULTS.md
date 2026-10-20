# Executed verification — #32, #88, #195 and E16 foundation

Date: 2026-10-20. Node 24.20.0 / pnpm 11.3.0, Docker default context/PostgreSQL 17.7, Linux Chromium, axe 4.14.0. All fixtures and settlements are synthetic. These current results supersede the earlier foundation-only run; the initial audit remains historical.

| Command / check | Actual result | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile` in existing workspace | PASS | Locked packages preserved; only pinned axe test dependencies added, no unrelated upgrades |
| `pnpm lint` | PASS | 154 files, no warnings after fixes |
| `pnpm typecheck` | PASS | Contracts, generated Prisma/API, tests/scripts and Next route/types |
| `pnpm test` | PASS | 29 API + 5 web tests; 34 total, zero failures |
| `pnpm test:integration` | PASS | 54 actual disposable PostgreSQL/SMTP scenarios |
| `pnpm test:e2e` | PASS | 14 Chromium tests; 14 expected, zero failed/skipped/flaky; 92.9 seconds in the final JSON report |
| Axe checkpoints | PASS | Eight checkpoints, zero detected violations, 13–17 passed-rule IDs per checkpoint; WCAG 2/2.1/2.2 A/AA tags |
| Emulated mobile conditions | PASS | 360×800, 4× CPU, 150ms latency, 200/100KiB/s down/up; desktop 1280×900; original 320px login remains |
| Captured mobile layout review | PASS observed screenshot scope | `.local/commerce-mobile-operator.png` inspected; controls/facts wrap with no clipping/horizontal overflow observed |
| `pnpm build` | PASS | Contracts, compiled Nest API/worker and optimized Next including three new commerce pages |
| `pnpm audit --audit-level=high` | PASS | No known vulnerabilities at execution |
| `git diff --check` and local documentation links | PASS | No whitespace/broken repository-local documentation links |
| Cold source `pnpm install --offline --frozen-lockfile` | FAIL environmental cache prerequisite | Source snapshot excluded dependencies/private environment; cache lacked a required tarball |
| Cold source frozen install with network retries/120s timeout | FAIL registry timeout | Reused 335/downloaded 14 of 350 packages, timed out before completion; raw log retained |
| Cold source subsequent typecheck/build/startup smoke | BLOCKED | Sequential verifier stopped at failed dependency installation; no later success is claimed |
| Canonical persistent `pnpm dev` | Not rerun in this session | Existing persistent dev data preserved; real migrated disposable API/Next startup and role journeys pass |
| Hosted CI/deployment | Outside these local results | Pushed commits trigger CI; report hosted status separately. No application deployment is configured by this change. |

## Domain and database evidence

Pure tests enumerate all pairs of the five state vocabularies and all forbidden roles, including terminal/same-state denial, exact TND bounds/rounding/overflow and 500 deterministic quantity/money partitions. They exercise allocation, cumulative output, QA approved/rejected/pending totals, settlement limits, rework consent, evidence, funding, cancellation and closure gates. Conditional branches are conservative: unsupported amendment/reapproval and dispute resolution cannot be reached through a permissive status toggle.

Five new PostgreSQL scenarios exercise private draft persistence/edit/submit, strict provenance/wearable rejection, cross-buyer/role denial, concurrent idempotent RFQ/quote acceptance, exact 100.001 TND buyer receipt, pending-payment cancellation protection, concurrent excess capacity reservation, decline/expiry/reallocation, owner-only offer decisions, single batch creation, cumulative progress/replay/overproduction, invalid QA totals, immutable/replayed inspection attempts, explicit rework acceptance/reinspection, shipment approval, separate exact 23.450 TND artisan payout, unpaid closure, material disposition and audited CLOSED state. All commercial audits have matching outbox records. Six-table schema/FK/unique/CHECK constraints migrate on empty and upgraded disposable databases.

The existing 49 foundation scenarios remain covered: sessions/MFA/CSRF/RBAC/delegation/privacy, optional keyed capacity, forced transaction rollback/retry, metadata-only events, bounded consumer failures/recovery, concurrent/duplicate receipt delivery, CLI status/processing and additive upgrades.

## Browser/accessibility evidence

The two new role-separated browser journeys create and reopen a buyer draft, submit/review/quote/accept, reconcile explicitly simulated funding, issue and voluntarily accept an offer, release/report/submit production, record QA with an announced mismatch then correction, complete inspection, approve/ship/deliver and accept buyer receipt. They assert persisted API quantities and exact strings. A real committed production response is intentionally dropped; the mounted form retries the same key, with one progress effect. Keyboard actions assert focus styling; error/status/empty/loading labels and reduced-motion behavior are exercised.

Axe checkpoints: buyer request form, artisan decision, operator QA review and buyer fulfillment, in both viewports. The JSON report retains passed-rule IDs and violation arrays, not a blanket compliance claim. CPU/network throttling is emulated, not a physical-device measurement. No complete screen-reader/cross-browser/manual WCAG certification was performed.

## Restore evidence and intermediate failures

The real protected temporary `pg_dump -Fc` archive was restored fail-fast into a second disposable PostgreSQL container. All **31 tables / 579 synthetic rows** matched counts and hashes, including commerce/inspection/payment/outcome/audit/outbox/receipt histories. Latest observed dump 145ms, restore-and-verify 1161ms, archive 140449 bytes. Provisioning is excluded, so these are not production RTO/RPO guarantees. Temporary archives/containers are cleaned up. Raw final metrics remain in `evidence/integration.log`.

Intermediate checks caught/fixed: an overly broad quantity iteration accidentally inspecting money context; a generic test type comparison; stale-version versus illegal-transition test expectations; a browser assertion before acceptance finished; and an alert locator also matching Next's route announcer. Failed runs were not counted as passing. A pg@8 deprecation warning about overlapping client queries was emitted during integration; it did not fail or alter the verified results and should be reviewed before a future pg@9 upgrade. No dependency upgrade was introduced to suppress it.

## Quality gate disposition

PASS for implemented synthetic scope: lint/types/build, pure dependency direction, independent session/RBAC/CSRF/strict schemas, tenant/money projections, exact state/quantity/money rules, transaction/replay/event consistency, mobile/keyboard/axe/reduced-motion/slow-browser journeys and real isolated restore. NOT APPLICABLE: live financial movement and physical measurements, neither implemented nor authorized. BLOCKED/UNVERIFIED for the full product: cold dependency installation in this network, production credentials/ingress/providers/alert routing/off-site recovery, ETL, firmware/hardware, and complete accessibility certification. See [target story completion](E16_TARGET_STORIES_REPORT.md) and [release readiness](E16_RELEASE_READINESS.md).
