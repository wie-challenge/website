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
- **Financial Backup & Restore Drill**: Populated `pg_dump` → `pg_restore` into `nasj_dhmad_restore_test` preserved all 9 payment/ledger/audit tables (`snapshots: 2, obligations: 4, escrows: 4, batches: 11, entries: 24, webhooks: 9, reconRuns: 14, payables: 2, simulations: 2`) in `4129 ms`.
- **Outstanding External Gates**: GitHub `sandbox-qualification` environment secrets + hosted CI run, permanent isolated Felcloud staging deployment, and `jq` installation for `test-release-provenance.py`.
