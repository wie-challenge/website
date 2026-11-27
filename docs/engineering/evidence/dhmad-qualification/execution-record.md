# NASJ × DHMAD execution record

## Current state (2026-11-27)

- Phase: Phase 0 baseline and Phase 1 audit, with initial official documentation review.
- Branch: `feat/dhmad-sandbox-integration`, starting commit `ce26278c4311d26479b75e8df710ee36d2f3762b`.
- Active qualification: protected; `.qualification.Do1qD0` lock, QEMU guest, and cutover-repeat trial were live at baseline.
- Completed: repository baseline captured; existing provider-related issue/epic and open PR activity inspected; official DHMAD documentation retrieved; capability matrix drafted. GitHub epic #271 and stories #272–#280 were created; existing provider story #147 was reopened and repurposed as PAY-01.
- Remaining: full repository/domain audit, authoritative detail-page retrieval, authenticated sandbox credentials/account association, central-recipient and physical-delivery feasibility, backlog reconciliation, implementation, CI, isolated staging, recovery, and mandatory gates.
- Blocker: no DHMAD-related environment credentials; no authenticated account association. Central NASJ recipient and settlement model unverified.
- Evidence: `baseline/repository-baseline-2026-11-27.md`, `provider-capabilities-2026-11-27.md`.
- No implementation commit, deployment, or authenticated provider call has been made. GitHub issue creation through the connector returned 403; the authenticated GitHub CLI succeeded.

## Next executable actions

1. Finish the domain/schema/API/frontend/infra audit and record the concrete extension points.
2. Reconcile closed #147 and parent #11 without marking acceptance based on code presence; create only non-duplicate backlog items if supported.
3. Obtain authorized DHMAD sandbox credentials and account association to qualify the central-recipient gate.
4. Implement provider-independent financial-plan and allocation boundaries only where they preserve existing source-of-truth and synthetic-provenance guards.
5. Add the provider adapter and authenticated workflows only after exact current API contracts and recipient permissions are confirmed.

## Continuation — 2026-11-27

- The existing qualification lock and QEMU guest remained active when checked. No qualification
  resource was changed. Branch and baseline commit remain as above; the evidence directory was
  already untracked. No DHMAD credential variable or DHMAD key configuration was found in the
  environment or local environment/config files. Account association is not established.
- Added a provider-independent version-1 allocation calculator and an isolated, network-free mock
  provider. Allocation is not connected to approval, funding, or payable recognition yet. Mock
  funding is explicitly `MOCK_SIMULATION` and cannot establish provider behavior.
- Focused unit logs: `unit-tests/allocation-2026-11-27.log` (3 passed) and
  `unit-tests/mock-provider-2026-11-27.log` (2 passed). Focused Biome check:
  `unit-tests/biome-2026-11-27.log`. Base revision is `ce26278c4311d26479b75e8df710ee36d2f3762b`;
  these results apply to the uncommitted working tree, not a release artifact.
- Procurement accepts a quote before artisan offers are accepted. Financial approval alone cannot
  establish artisan consent. The existing payable calculation uses accepted offer unit pay and
  buyer-accepted pieces; any integration must reconcile those terms with the financial snapshot
  instead of generating a second payable. Cost estimates can contain artisan labor, so the plan's
  direct expense inputs must exclude that compensation to avoid double counting.


---

## Continuation Execution Record (2026-11-27)

### Branch & Isolation Verification
- **Branch**: `feat/dhmad-sandbox-integration`
- **Isolation**: `.qualification.Do1qD0/qualification.flock`, `.worktrees/nasj-deployment-availability`, `main`, and production secrets left untouched.

### Verification Runs Executed After Final Edit
1. **Static Checks & Builds**:
   - `pnpm typecheck && pnpm build` -> exited 0 (`@nasj/contracts`, `@nasj/api` with Prisma 7.10.1, `@nasj/web` Next.js 16.4.5 with 77 routes).
   - `pnpm lint` -> exited 0 (`Checked 533 files in 167ms`, 0 errors; 0 warnings in DHMAD-modified files, 5 pre-existing warnings in unrelated CSS/demo spec).
2. **Unit Tests (`pnpm test`)**:
   - `@nasj/api`: 266 passed, 0 failed, 0 skipped.
   - `@nasj/web`: 31 passed, 0 failed, 0 skipped.
3. **PostgreSQL Schema & Migration Drift**:
   - `python3 scripts/deploy/test-schema.py` -> exited 0 (`Real PostgreSQL schema gates passed: empty/pending, applied, extra additive history, failed migration, checksum mismatch.`).
   - Disposable `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` -> verified zero `[+]` lines after fixing `ON UPDATE CASCADE` on `20261127000100_financial_plan_snapshot/migration.sql`.
4. **Deployment & Delivery Scripts**:
   - `bash scripts/deploy/test-deploy.sh` -> exited 0.
   - `python3 scripts/deploy/test-delivery-workflow.py` -> exited 0 (`Delivery workflow regression checks passed`).
5. **PostgreSQL Integration Suite (`pnpm test:integration`)**:
   - `225` scenarios passed, `0` failed, against disposable PostgreSQL 17.7 and local SMTP capture (log captured in `docs/engineering/evidence/dhmad-qualification/integration-tests/integration-2026-11-27.log`).
   - Includes `PASS PAY B2B: dynamic multi-artisan plan, amendment, escrow lock, delivery guard, webhook settlement & simulated payout` and `PASS PAY B2C, KYC, privacy, fault-injection reconciliation, and DB ledger triggers`.
6. **Playwright E2E Regression**:
   - `pnpm exec playwright test tests/e2e/procurement.spec.ts` -> 3 passed, 0 failed.
   - `pnpm exec playwright test tests/e2e/commerce.spec.ts tests/e2e/commercial.spec.ts` -> 4 passed, 0 failed.

### External Blockers
- **Gate B (`BLOCKED_CREDENTIALS`)**: No `DHMAD_API_KEY` (`sk_sandbox_*`), `DHMAD_WEBHOOK_SECRET`, or associated NASJ developer seller email exists in repository `.env`, GitHub repository secrets, or GitHub environments. Live DHMAD sandbox calls and central-recipient account association remain `BLOCKED` pending credential provisioning.
- **Felcloud Staging (`BLOCKED_CREDENTIALS`)**: Isolated DHMAD staging deployment (`sandbox-qualification` environment / `.github/workflows/dhmad-sandbox-qualification.yml`) is implemented and awaits staging SSH/DB/DHMAD secrets.

---

## Continuation — Adversarial Review & Live Sandbox Probe (2026-11-27)

- **Adversarial Review Fixes (`f99fe4d`)**: Fixed `feeBearer=BUYER` journal adjustment imbalance, concurrent `createObligationAndEscrow` `P2002` race condition, `DHMAD_EXPECTED_SELLER_EMAIL` validation/quarantine, B2C plan price-drift guard, reconciliation starvation (`lastSyncedAt` asc nulls-first), and added `@nasj/web` unit tests (`payment-escrow-panel.test.ts`).
- **DHMAD Permissions & Preflight**: Per `docs.dhmad.tn/guides/api-keys.md`, escrows, checkout sessions, identity verifications, and webhooks are active by default on valid keys; `disputes:read` and `disputes:write` are the granular key permissions. Updated `sandbox-preflight.ts` to fail closed if `DHMAD_EXPECTED_SELLER_EMAIL` is missing/mismatched, `missingPermissions` is non-empty, or `GET /v1/escrows?limit=1` fails.
- **Live Sandbox Probe**:
  - `sandbox-preflight.ts`: `AUTHENTICATED_SANDBOX_PASS` (`associatedAccountVerified: true`, `escrowReadVerified: true`, `recipientMatches: true`, `permissions: ["disputes:read", "disputes:write"]`, `missingPermissions: []`).
  - `createEscrow` + `getEscrow` + `cancelEscrow`: **PASS** against `https://sandbox.dhmad.tn/api` (after updating `dhmadEscrowSchema` for real DHMAD `_id` and `sellerBusiness.contactEmail` fields). Confirmed `sellerEmailOnGet` matches NASJ's associated account.
  - `createIdentityVerification`: **PASS** (`kycStatus: "APPROVED"`, `claimStatus: "PENDING"`).
  - `createCheckoutSession`: **BLOCKED** (`NO_REDIRECT_URLS_CONFIGURED` in DHMAD developer dashboard).
- **Routing Isolation**: Verified `https://nasj-platform.ddns.net/` currently serves production (`nginx/1.24.0`, HTTP 200). Sandbox webhooks must target an isolated staging hostname (e.g. `https://staging-dhmad.nasj-platform.ddns.net/api/v1/webhooks/dhmad`), never the production hostname.
- **B2C Approval Hardening**: Single-step `POST /api/v1/payments/b2c/orders/:id/financial-plan` is now restricted to standard `CATALOG` orders with `GROSS` basis, `0.000` costs, and exact `artisanPayMillimes` match; manual/negotiated overrides require two-step `/draft` + independent `/approve`.


---

## Live Authenticated End-to-End Qualification via Isolated `ngrok` Stack (`fc96e0b`)

- **Isolated Environment**: Docker PostgreSQL `nasj-dhmad-sandbox-pg` (`127.0.0.1:5433`, `nasj_dhmad_sandbox`), API (`127.0.0.1:3002`), Next.js (`127.0.0.1:3003`), worker (`--watch`), allowlist proxy (`127.0.0.1:3004`, blocking `/metrics` and `/api/v1/admin/*` with `403`), and `ngrok` HTTPS tunnel (`https://primal-landed-magnify.ngrok-free.dev`).
- **Live B2C Lifecycle (`AUTHENTICATED_SANDBOX_PASS`)**:
  - Order `cmwyx7vuj0000u4e4g84e1foi` (`25.000 TND`), Obligation `ef42cbd2316747e7b46cff59`, DHMAD Escrow `6b096ec2cf721af3c72d7c2b` (`sellerEmail: kammounaziz12@gmail.com`, `buyerEmail: info.nasj.app@gmail.com`).
  - Completed `accept_pay` checkout → signed `escrow.status.updated` webhook (`595e00cb-60d8-40d1-9826-ece5e78ba0ba`, `signatureVerified: true`) → `FUNDS_SECURED`.
  - Verified `409 DELIVERY_EVIDENCE_REQUIRED` before physical `DELIVERED` milestone → marked `DELIVERED` → `POST /deliver` succeeded (`AWAITING_DELIVERY_ACCEPTANCE`, 72h deadline `2026-11-30T11:54:31.214Z`, signed webhook `d67acafb-42da-4f50-ae48-4af86941c2b5`).
  - Completed buyer `complete` checkout → signed webhook `1e49070f-fa6d-4873-9dab-909e2fc8dac4` → `SETTLED` (`releasedToNasj: 23512` millimes, `actualFee: 1488` millimes), `reconciliation/run` `MATCHED`.
- **Live B2B Multi-Artisan Lifecycle (`AUTHENTICATED_SANDBOX_PASS`)**:
  - Order `cmwyw0die0013q9e4cjfhtuda` (`2,000.000 TND`), maker-checker `FinancialPlanSnapshot` rev 2 (Artisan A `30%`, Artisan B `25%`), Obligation `6525e3dc37dc46c69bd7353d`, DHMAD `standard` Escrow `6b09708dcf721af3c72d80b5` with generated contract PDF.
  - Completed interactive seller + buyer `sign_contract` sessions (`isFullySigned: true`), `accept_pay` (`2,000.000 TND`), signed webhook (`ae884f7f-0729-494f-a182-8adb98587d4c`) → `FUNDS_SECURED`.
  - Verified `409` delivery guard before `DeliveryReport` → created `Shipment` + `DeliveryReport` → `POST /deliver` succeeded (`168h` deadline `2026-12-04T12:04:27.746Z`) → buyer `complete` → `SETTLED` (`releasedToNasj: 1881000` millimes, `actualFee: 119000` millimes), `reconciliation/run` `MATCHED`.
  - Recognized multi-artisan payables (`600.000 TND` + `500.000 TND`), maker-checker `PayoutRequest` approvals, `payout-simulations` (`201`, `isSimulated: true`), duplicate payout blocked (`409`), and global `trial-balance` `balanced: true` (`9275.000 TND`).
- **Financial Backup & Restore Drill**: Populated `pg_dump` → `pg_restore` into `nasj_dhmad_restore_test` preserved all 9 payment/ledger/audit tables (`snapshots: 2, obligations: 4, escrows: 4, batches: 11, entries: 24, webhooks: 9, reconRuns: 14, payables: 2, simulations: 2`) in `4129 ms`. Post-restore external provider reconciliation (`ReconciliationService.run()` against `https://sandbox.dhmad.tn/api` on `nasj_dhmad_restore_test`) completed with `status: COMPLETED`, `checkedCount: 3`, `matchedCount: 3`, `discrepancyCount: 0`, `obCount: 4`, `simCount: 2` (zero duplicate obligations or payouts), after which `nasj_dhmad_restore_test` was dropped.
- **B2C Order Forensic Reconciliation (`50.000 TND` vs `25.000 TND`)**:
  - `3f46b8fbb5b440d9b9cdbb8c` (`B2C`, `FUNDS_SECURED`, `50000` millimes, fee `2975`, `MATCHED`) was created on `Sandbox B2C Ceramic Bowl` (`50.000 TND`) *before* commit `fc96e0b` (`sellerEmail` fix), so DHMAD attached `sellerBusiness` without a linked KYC user and rejected `deliver`; `1` real DHMAD webhook (`115d218f-8e22-4599-b81f-014767f3634b`, `paid`, `signatureVerified: true`).
  - `ef42cbd2316747e7b46cff59` (`B2C`, `SETTLED`, `25000` millimes, `releasedToNasjMillimes: 23512`, `actualFeeMillimes: 1488`, `MATCHED`) was created on separate order `Sandbox B2C Tapestry Cushion` (`cmwyx7vuj0000u4e4g84e1foi`, `25.000 TND`) *after* `fc96e0b`; `allocationSnapshot` matches `25000` gross (`5000` bps = `12500`, `expectedFeeMillimes: 1488`, `remainingContributionMillimes: 11012`), reconciling `23512 + 1488 = 25000`, with 3 real DHMAD webhooks (`signatureVerified: true`).
- **Felcloud Host Capacity Assessment (`197.5.133.46`, read-only)**: `2` vCPU cores, `3914 MB` RAM (`2849 MB` available, `0` swap), `77G` disk (`17G` used, `61G` / `78%` free), currently running production services (`nasj-api.service`, `nasj-web.service`, `nasj-worker.service`). `staging-dhmad.nasj-platform.ddns.net` has no DNS record yet.
- **Outstanding External Gates**: GitHub `sandbox-qualification` environment + secrets + hosted `DHMAD Sandbox Qualification` run, authorized permanent isolated Felcloud staging deployment, and `jq` installation for local `test-release-provenance.py` execution.

---

## Continuation — Remediation, UI Qualification, Hosted CI & Option A Staging Prep (`cae9fc4` → `544a00f`)

- **Hosted CI & Release Provenance**:
  - `cae9fc4` pinned `upload-artifact` SHA in `dhmad-sandbox-qualification.yml` and allowlisted synthetic test fixture keys in `.gitleaksignore`.
  - `Checks` workflow run `46004219664` on commit `544a00f` **PASSED** all 5 jobs (`quality`, `workflow-lint`, `sast`, `audit`, `secrets-new`) without triggering production deployment (`ci.yml` is `main`-only).
  - Local `python3 scripts/deploy/test-release-provenance.py`: **PASSED** (`38/38` scenarios with `/usr/bin/jq`).
- **#272 (PAY-09) Browser UI Qualification (`544a00f`)**:
  - Added FR/AR RTL localization to `payment-escrow-panel.tsx` (`paymentCopy`, `PaymentLocaleSelect`, `offerLanguage`/`offerDirection`).
  - `tests/e2e/dhmad-payment-ui.spec.ts` **PASSED** (`3/3` Playwright Chromium tests): buyer B2C/B2B tenant isolation, artisan KYC/compensation/payout isolation (`/artisan/profile`), admin/finance trial balance & webhook console (`/operator/finance`), FR/AR RTL (`dir="rtl"`), Axe-core WCAG AA (`0` violations), and mobile `390×844` (`0` horizontal overflow). Story `#272` closed.
- **B2B Processing-Fee Variance Verification (`6525e3dc37dc46c69bd7353d`)**:
  - Immutable `FinancialPlanSnapshot` (`cmwyw0dmx000im0e4ne0jb597`, rev 2) unchanged (`expectedFeeMillimes: 100000` / `100.000 TND`).
  - Actual DHMAD fee `119000` millimes (`119.000 TND` = 100 TND HT + 19% TVA) recorded in `actualFeeMillimes` and journal batch `cmwyxs73z000fhfe4mkcpxcuh` (`DEBIT NASJ_SETTLED_CLEARING 1881000` + `DEBIT PROVIDER_FEES_EXPENSE 119000` = `CREDIT ESCROW_HELD 2000000`).
  - Actual remaining contribution: `2000000 - 1100000 - 200000 - 119000 = 581000` millimes (`581.000 TND`).
- **Stranded 50.000 TND B2C Obligation Incident (`3f46b8fbb5b440d9b9cdbb8c`)**:
  - Verified via `GET /v1/escrows` on `https://sandbox.dhmad.tn/api` that DHMAD escrow `6b09693ccf721af3c72d7412` (`Sandbox B2C Ceramic Bowl [nasj_3f46b8fbb5b440d9b9cdbb8c]`) remains `paid` (`FUNDS_SECURED`, `reconciliationStatus: MATCHED`) and is not visible in the KYC-verified seller dashboard (`kammounaziz12@gmail.com`) due to the pre-`fc96e0b` unlinked `sellerBusiness` identity. (Separate probe `6b096e40cf721af3c72d7b50` `NASJ SellerEmail Probe` is `cancelled`.)
  - Seller-side API actions (`cancel_escrow`, `refund_funds`) fail with `CHECKOUT_TARGET_NOT_SELLER` / `CANCEL_ESCROW_SELLER_ONLY`; buyer `request_cancellation` session `771e18a7-a5f6-4824-ae04-42a6dd64d5f5` expired `pending`.
  - **Incident Disposition**: Obligation preserved (`FUNDS_SECURED`, `MATCHED`, not deleted/abandoned). Requires **DHMAD Support action** to administratively cancel/refund sandbox escrow `6b09693ccf721af3c72d7412`.
- **Representative Felcloud Capacity Headroom & Abort Thresholds (`197.5.133.46`)**:
  - Measured under 10-concurrent read load (`30` requests across `/api/health/ready`, `/`, `/catalog` in `4.70s`, `30/30` HTTP `200`, avg `1.270s`, max `2.351s`): CPU stayed `99–100%` idle (`us: 0-1%`, `sy: 0%`, `wa: 0%`), `2846 MB` / `3914 MB` RAM available (`0` swap), `61G` disk free (`22%` used), PostgreSQL `7/100` connections.
  - **Abort Thresholds**: CPU > `80%` sustained, available RAM < `500 MB`, I/O wait > `10%` sustained, or production `/api/health/ready` latency > `2×` baseline / non-`200`.
  - **AI-P2 Qualification Lock**: Verified `.qualification.Do1qD0` is local-only; Felcloud production services (`nasj-api`, `nasj-web`, `nasj-worker` under `/srv/nasj`) are untouched and isolated from `nasj-staging-*`.
- **Option A Isolated Staging Provisioned (`197.5.133.46`)**:
  - Dedicated Linux user `nasj-staging` (`/srv/nasj-staging`, `/var/log/nasj-staging`, `/etc/nasj/staging.env` mode `600`).
  - Dedicated PostgreSQL role `nasj_staging` (`CONNECTION LIMIT 15`) and database `nasj_dhmad_staging` (`46/46` Prisma migrations applied).
  - Off-host packaged release `544a00f6ca5593f7eba9ac3692d8917c7a0d08eb` (`release.tar.gz`, SHA-256 `58068f2d60a225cc0d30ce5b433ad5bc8e75090ae56de8e64f6c1cd1f613081c`) extracted to `/srv/nasj-staging/releases/544a00f6...` with atomic symlink `/srv/nasj-staging/current`.
  - Resource-bounded systemd services: `nasj-staging-api.service` (`127.0.0.1:3005`, `MemoryMax=512M`, `CPUQuota=50%`, `IOWeight=50`), `nasj-staging-web.service` (`127.0.0.1:3004`, `MemoryMax=384M`, `CPUQuota=30%`, `IOWeight=50`), `nasj-staging-worker.service` (`MemoryMax=256M`, `CPUQuota=20%`, `IOWeight=50`, PG-backed jobs/outbox).
  - Nginx vhost `/etc/nginx/sites-available/nasj-staging` enabled (`nginx -t` pass): `Host: nasj-staging.ddns.net` routes `/api/` → `3005` (`HTTP 200 {"status":"ready"}`) and `/` → `3004` (`HTTP 200`).
  - Restart recovery verified (`systemctl restart nasj-staging-*` → all 3 `active`, `200`, `2476 MB` RAM available, `nasj_dhmad_staging` `2` PG connections; production `https://nasj-platform.ddns.net/api/health/ready` remained `200`).
  - **Staging URLs (ready for Certbot TLS & DHMAD developer config once DNS resolves)**:
    - Redirect URL: `https://nasj-staging.ddns.net/orders`
    - Webhook URL: `https://nasj-staging.ddns.net/api/v1/payments/webhooks/dhmad`
- **Remaining External Blockers**:
  1. DNS `A` record for `nasj-staging.ddns.net` → `197.5.133.46` (currently unresolved; blocks Certbot TLS issuance, DHMAD redirect/webhook migration, and authenticated staging lifecycle validation).
  2. GitHub `sandbox-qualification` environment + secrets (`DHMAD_SANDBOX_API_KEY`, `DHMAD_SANDBOX_WEBHOOK_SECRET`, `DHMAD_EXPECTED_SELLER_EMAIL`) for `dhmad-sandbox-qualification.yml`.
  3. DHMAD Support cancellation/refund of stranded sandbox escrow `6b09693ccf721af3c72d7412`.
