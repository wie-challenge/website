# Test scope and evidence

Run from the website root with Node 24 / pnpm 11.3.0 / Docker default context. Chromium is selected from `/usr/bin/chromium` or Playwright's installed browser; install with `pnpm exec playwright install chromium`. No sibling repository is required. Tests create/migrate/remove uniquely named disposable PostgreSQL 17.7 containers, capture SMTP locally and never accept production credentials as test-write or restore targets.

- `pnpm test`: the API and web unit suites. Run it and read the reported total; the counts change as cases are added, so this document does not restate them. The independent IoT simulator is a separate repository and runs its own suite. Domain cases enumerate valid/invalid/unauthorized/terminal transitions for RFQ/order/offer/batch/payment, exact TND bounds/rounding, quantities, allocation, cumulative production, QA reconciliation, settlement, closure and deterministic property-style partitions. Existing identity/capacity/operations cases remain.
- `pnpm test:integration`: actual PostgreSQL/Nest/Better Auth/SMTP scenarios (requires Docker), including atomic projection/inbox delivery, failure rollback, real worker SIGKILL/restart, safe backfill, scoped report/CSV/revocation and ledger independence. Commerce cases persist/reopen private drafts, accept exact quotes once, reconcile buyer funding, test concurrent capacity reservations, decline/expiry/reallocation, owner-only decisions, cumulative progress, failed QA totals, immutable/replayed inspections, consensual rework, shipment gates, exact separate buyer/artisan simulated ledgers, unpaid closure and audited completion. Existing session/RBAC/tenant/replay/outbox/upgrade tests remain. The real restore drill compares every public table, including commercial state and payment history, by counts and content hashes in a second disposable database; `scripts/pg/migrate-verify.mjs` reports the current table count rather than this document naming it.
- `pnpm test:e2e`: 18 optimized Chromium browser tests. Three complete synthetic commerce journeys run at 360×800, 768×1024 and 1280×900 through separate artisan payout/order closure and report/CSV/inbox; the mobile journey uses 4× CPU throttling, 150ms latency and constrained throughput. Actions run with keyboard activation and focus assertions, forms have associated labels, saved drafts reopen, server-committed responses are dropped/retried with the same key, QA errors are announced, reduced motion overrides inline animations and persisted fulfillment/money are asserted through the API. Existing 320px keyboard/skip-link, mobile identity, no-JavaScript, pending submission, network failure and organization/delegation/MFA tests remain.
- `pnpm test:e2e --grep 'signup, email verification, profile'`: focused disposable startup/authentication smoke using the same real setup, suitable for clean-source verification after dependencies install.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm audit --audit-level=high`: actual static, production compilation and dependency checks.

Commerce fixtures are version **commerce-v1** in `apps/api/test/commerce.fixture.ts` (stable fictional identities/quantities/amounts; future deadlines are relative to execution time). Fixture seeding/control endpoints are imported only by test harnesses, never by the API application. The browser control server binds loopback with a random per-run nonce and is removed during cleanup. No real order or funds are used.

Axe 4.14.0 scans the main-content regions at buyer form, artisan decision, operator review and buyer fulfillment checkpoints with WCAG 2/2.1/2.2 A/AA tags, plus the expanded report/inbox checkpoint, for all three viewport profiles (15 axe checkpoints). The final Playwright JSON report is `.local/e2e-report.json` and includes each axe checkpoint's violations/passed-rule IDs plus synthetic persisted-result attachments. Captured operator screenshots are `.local/commerce-{mobile,tablet,desktop}-operator.png`; the mobile screenshot was visually inspected for clipping/readability. CI retains the targeted JSON/screenshots, integration log and failure traces for three days. No credentials/environment file is an artifact target.

These checks are evidence for the implemented critical journeys, not a complete WCAG certification, independent screen-reader evaluation, cross-browser claim or measurement of a physical low-end device. CPU/network conditions are explicitly **emulated**. Firmware/simulator/physical device evidence remains separate in `../firmware/README.md`.

Actual execution outcomes, including failed intermediate tests and clean-install/network limitations, are recorded in `../engineering/e16-test-results.md`; the three requested issues have their own acceptance mapping in `../engineering/e16-target-stories-report.md`.


Simulator tests cover valid/invalid finite/range/clock signals, exact threshold boundary, rest, cooldown, control/reset/disable, simulated motor failure, local week boundaries/clock jumps/retention/deletion and zero attempted fetch/TCP calls. They are explicitly software simulation, not hardware calibration or packet capture. A pre-relocation integration run launched the standalone simulator and verified unchanged capacity/commerce/event ledgers. That observation is retained historically; current website tests do not launch or depend on the IoT checkout.

Restore tests run the actual AES-256-GCM backup CLI, authenticate/decrypt and restore into a disposable database, checking all table hashes. Unit tests reject wrong keys, tampering, unsafe permissions/symlinks, overwrite and unsafe retention deletion. Operational tests verify real Pino secret redaction, readiness failures, queue alert thresholds and approved 24-hour backup-age alerts. Test timing remains a small local observation, not a hosted RTO guarantee.


Final source verification now includes `pnpm verify:clean`: actual ordinary frozen installation and the full ten-command pipeline in a fresh temporary source checkout, including all 15 browser cases and dependency audit. No previous verify-dependencies workaround or trust-lockfile option is used. Current local operations tests also check user timers, strict package-owned health CLI boot, private bounded alerts and actual outage/recovery. Earlier network/cache failures remain historical evidence; the current frozen install and both website/IoT audits pass.


E02 catalog verification adds three disposable API scenarios for the bounded buyer-safe projection, replay-safe catalog-to-RFQ creation, forged/unavailable/mismatched selections, inactive crafts and an empty active catalog. The existing root operations CLI regression now owns a temporary 503 endpoint, so a running developer API cannot turn its intentional-outage assertion into a false failure.

Three catalog browser cases cover mobile (360×800) and desktop (1280×900) browsing, synthetic/unavailable labels, lead-time assumptions, keyboard activation, missing-image and empty-category states, RFQ specification prefill, required buyer confirmations and a persisted editable draft with no order. A separate controlled-failure case covers loading, a safe 503/retry, an empty projection and a genuinely failed image request. Main-content axe scans cover both catalog/RFQ viewports and the image fallback. Screenshots `.local/catalog-{mobile,desktop}.png` are ignored locally and retained in the CI evidence artifact. Run `pnpm test:e2e --grep 'catalog'` for focused coverage; the full suite also retains all existing commerce/identity journeys.

## Local role accounts

Run `pnpm db:seed` from `website` with the local development database and SMTP service running. It creates these synthetic logins and writes their generated passwords to the private, ignored `.local/dev-credentials.json`:

| Persona | Email | Landing page |
| --- | --- | --- |
| Platform admin | `admin@nasj-demo.invalid` | `/admin` |
| NASJ operator | `operator@nasj-demo.invalid` | `/operator` |
| Buyer representative | `buyer@nasj-demo.invalid` | `/buyer` |
| Association coordinator | `coordinator@nasj-demo.invalid` | `/association` |

The operator is assigned to the demo buyer and partner association organizations, and the buyer has an explicit quotation-approval grant. The fictional artisan is an association-managed participant record assigned to the coordinator; a fresh seed creates no artisan, production or finance login. Existing historical users and linked artisan records are preserved. The credential file lists only the four current login personas; historical credentials are omitted. Existing persona passwords remain stable on repeat runs; the new operator receives a generated password on its first seed. A missing credential manifest for an existing fixture login causes refusal rather than a password reset.

`pnpm demo:seed` uses the same four personas in the separate demo database and writes `.local/demo-credentials.json`. Seeding stays restricted to the configured local databases. The seed does not restore intentionally revoked assignments, affiliations or permission grants.

## Maintaining CI scenarios

Use `tests/e2e/actions.ts` for actions that open the application's explicit confirmation dialog.
The helper asserts that the dialog opens, confirms the same action and waits for it to close;
it does not bypass confirmation or make it optional. Actions without confirmation keep ordinary
clicks. Email verification links now verify during hydration; assert the resulting verified status
and removal of the URL token rather than waiting for the former verification button.

Keep assertions aligned with current identity landing paths and navigation. The profile now shows
its sections together and offers bulk revocation of other devices. Test keyboard access to the
current fields and navigation drawer, and verify that the other device actually loses its session.
Use a different owner for cross-company fixtures: an account cannot simultaneously belong to two
buyer companies. The identity browser scenario creates organizations through `/welcome`, uploads
both synthetic verification PDFs and records both administrator review checks.

Historical migration drills must select only columns present at their baseline. Use the bounded
`deployTestMigrations` test helper when a drill is meant to examine one migration prefix; it accepts
only loopback test database names. The closure drill applies its intended migration without
accidentally including later schema changes in its row comparison. Full-chain upgrade and restore
drills still exercise the current migration chain and preserve business-row hashes. Never modify
applied SQL to make a test fixture work.

Landing text stays opaque during entrance motion so its contrast remains readable. Browser
accessibility checks cover normal motion and reduced motion without excluding contrast rules.

Production verification runs the complete integration suite against both PostgreSQL 16.11
(the inspected VPS major) and 17.7 (development). Set `POSTGRES_TEST_IMAGE` to choose the
isolated test container image; no production database URL is used. Historical upgrade tests
replay only their intended migration prefix, use matching restore targets, and preserve strict
row hashes, migration checksums and constraints. Current Prisma clients select only columns
that existed when constructing pre-migration fixtures.

Deployment control-flow tests run with `bash scripts/deploy/test-deploy.sh`. They use temporary
paths and fake service commands to test preparation refusal, checksum/path/identity rejection,
migration approval and backup gates, and automatic rollback. `test-schema.py` checks the real
migration-history gate against a disposable PostgreSQL. `smoke-release.py RELEASE.tar.gz`
starts only the extracted candidate with a fresh database and requires free ports 3000/3001;
it never contacts the VPS. Keep these tests separate from live recovery evidence.

The demo feedback form retries an immutable command after an uncertain result, rechecks
visitor-scoped acceptance before showing it, preserves independently edited drafts and clears
accepted information when authority expires. Browser recovery cases exercise both supported
viewport widths; the optional storyboard recording test remains skipped without `NASJ_CLIP_DIR`.
