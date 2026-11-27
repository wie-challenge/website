# NASJ × DHMAD Sandbox Integration — Qualification Report (2026-11-27)

## 1. Executive Summary
- **Commercial Architecture**: Implemented central NASJ-recipient escrow (`sellerEmail` omitted so NASJ's associated DHMAD account acts as escrow recipient; `developerFeePercentage` unused), dynamic per-request multi-artisan financial allocations (`GROSS` | `AFTER_MATERIALS` | `AFTER_DIRECT_COSTS`, integer millimes and basis points), immutable approved snapshots locking on escrow funding, append-only double-entry journal, artisan payables, and strictly simulated payouts (`REAL_PAYOUTS_ENABLED=false`, live payments disabled).
- **Qualification Outcome**: All local offline, mock-provider, PostgreSQL schema/migration, ledger trigger, integration, unit, lint, build, and Playwright regression gates **PASSED** after the final code edit. Live DHMAD sandbox qualification (Gate B) and isolated Felcloud staging deployment remain **`BLOCKED_CREDENTIALS`** because no `sk_sandbox_*` credentials or DHMAD account association exist in the environment or GitHub Secrets.
- **Safety & Isolation**: Unrelated AI-P2 mission artifacts (`.qualification.Do1qD0`, `.worktrees/nasj-deployment-availability`), `main`, and production secrets were left completely untouched.

## 2. Qualification Gate Matrix

| Gate | Scope | Status | Evidence / Outcome |
| :--- | :--- | :--- | :--- |
| **Gate A** | DHMAD capability audit & provider adapter contracts | **PASS** | `provider-capabilities-2026-11-27.md`, `packages/contracts/src/payments.ts`, `dhmad.adapter.ts`, `@nasj/api` unit suite (266/266 pass) |
| **Gate B** | Authenticated DHMAD sandbox qualification (`sk_sandbox_*`, NASJ central-recipient association, B2C checkout, B2B escrow, webhooks) | **BLOCKED** | `BLOCKED_CREDENTIALS`: No `DHMAD_API_KEY`, `DHMAD_WEBHOOK_SECRET`, or DHMAD developer credentials present in host `.env` or GitHub Secrets (`gh secret list` empty) |
| **Gate C** | Database schema, migrations, ledger balance/immutability triggers & restore drill | **PASS** | `20261127000100_financial_plan_snapshot`, `20261127010000_dhmad_payments_infrastructure`, `test-schema.py`, `prisma migrate diff`, `pg_dump`/`pg_restore` (159 tables, 225 integration scenarios pass) |
| **Gate D** | Deterministic mock workflow, fault-injection recovery, webhooks, reconciliation & simulated payouts | **PASS** | `DeterministicMockPaymentProvider`, `dhmad-payments.scenarios.ts` (PAY B2B + PAY B2C scenarios pass in `pnpm test:integration`) |
| **Gate E** | Frontend workspaces (`OrderEscrowPanel`, `FinancialPlanPanel`, `PaymentsOperationsPanel`, `ArtisanFinancePanel`) & accessibility regressions | **PASS** | `@nasj/web` build (77 routes), `@nasj/web` unit tests (31/31 pass), Playwright E2E `procurement.spec.ts` (3/3 pass), `commerce.spec.ts` + `commercial.spec.ts` (4/4 pass) |
| **Gate F** | Security, secret hygiene, CI/CD staging workflow & deploy gates | **PASS (local) / BLOCKED (remote staging)** | `pnpm lint` (0 errors), `test-deploy.sh`, `test-delivery-workflow.py` pass; `.github/workflows/dhmad-sandbox-qualification.yml` ready; remote staging awaits credentials |

## 3. Verified Commands (Run After Final Edit)
- `pnpm typecheck && pnpm build`: exit 0 (`@nasj/contracts`, `@nasj/api`, `@nasj/web` 77 routes)
- `pnpm lint`: exit 0 (`Checked 533 files in 167ms`, 0 errors; 5 pre-existing warnings in unrelated CSS/demo files)
- `pnpm test`: exit 0 (`@nasj/api`: 266 passed, 0 failed; `@nasj/web`: 31 passed, 0 failed)
- `python3 scripts/deploy/test-schema.py`: exit 0
- `bash scripts/deploy/test-deploy.sh && python3 scripts/deploy/test-delivery-workflow.py`: exit 0 (`test-release-provenance.py` not re-run; `jq` binary not installed locally)
- `pnpm test:integration`: exit 0 (`225` scenarios passed against disposable PostgreSQL 17.7 and local SMTP capture; log: `docs/engineering/evidence/dhmad-qualification/integration-tests/integration-2026-11-27.log`)
- `pnpm exec playwright test tests/e2e/procurement.spec.ts`: 3 passed, 0 failed
- `pnpm exec playwright test tests/e2e/commerce.spec.ts tests/e2e/commercial.spec.ts`: 4 passed, 0 failed

## 4. Open Blockers & Operator Action Required
1. Provision DHMAD sandbox API credentials (`DHMAD_API_KEY=sk_sandbox_...`, `DHMAD_WEBHOOK_SECRET`, `DHMAD_EXPECTED_SELLER_EMAIL`) in the GitHub `sandbox-qualification` environment and staging host runtime env, ensuring the NASJ DHMAD account is associated as recipient.
2. Provision isolated Felcloud staging target secrets for `.github/workflows/dhmad-sandbox-qualification.yml`.
3. Execute sandbox preflight and authenticated Gate B verification workflow once credentials are supplied; do not close `#271`, `#147`, or `#272`–`#280` until Gate B and isolated staging qualification pass.
