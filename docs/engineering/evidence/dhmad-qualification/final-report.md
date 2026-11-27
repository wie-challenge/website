# NASJ × DHMAD Sandbox Integration — Qualification Report (2026-11-27)

## 1. Executive Summary
- **Commercial Architecture**: Implemented central NASJ-recipient escrow (`DHMAD_EXPECTED_SELLER_EMAIL` enforced fail-closed; `developerFeePercentage` unused), dynamic per-request multi-artisan financial allocations (`GROSS` | `AFTER_MATERIALS` | `AFTER_DIRECT_COSTS`, integer millimes and basis points), immutable approved snapshots locking on escrow funding, append-only double-entry journal, artisan payables, and strictly simulated payouts (`REAL_PAYOUTS_ENABLED=false`, live payments disabled).
- **Qualification Outcome**: Local offline, mock-provider, PostgreSQL schema/migration, ledger trigger, integration (225/225), unit, lint, build, financial backup/restore, **and live authenticated DHMAD B2C + B2B + multi-artisan sandbox lifecycles via isolated `ngrok` staging** all **PASSED** (`AUTHENTICATED_SANDBOX_PASS`).
- **Remaining Gates**: GitHub `sandbox-qualification` environment secrets & hosted CI execution, permanent isolated Felcloud staging deployment, and `jq` prerequisite for `scripts/deploy/test-release-provenance.py`.
- **Safety & Isolation**: Unrelated AI-P2 mission artifacts (`.qualification.Do1qD0`, `.worktrees/nasj-deployment-availability`), `main`, and production (`https://nasj-platform.ddns.net`) were left completely untouched.

## 2. Qualification Gate Matrix

| Gate | Scope | Status | Evidence / Outcome |
| :--- | :--- | :--- | :--- |
| **Gate A** | Repository & infrastructure safety | **PASS** | `feat/dhmad-sandbox-integration` (`fc96e0b` + evidence), AI-P2 lock/VM and production untouched |
| **Gate B** | Authenticated DHMAD provider feasibility | **PASS** | `AUTHENTICATED_SANDBOX_PASS`: `sandbox-preflight.ts`, live `createEscrow`, `getEscrow`, `getContract`, `createCheckoutSession`, `deliverEscrow`, `createIdentityVerification`, `cancelEscrow` |
| **Gate C** | Financial correctness | **PASS** | `FinancialPlanSnapshot` DB triggers, B2C maker-checker override guard, `trial-balance` `balanced: true` (`9275.000 TND`), multi-artisan 30% + 25% allocation & simulated payouts |
| **Gate D** | Complete functional integration (B2C + B2B) | **PASS** | Live B2C (`ef42cbd2316747e7b46cff59` → `23.512 TND` net, `1.488 TND` fee) and B2B (`6525e3dc37dc46c69bd7353d` → `1881.000 TND` net, `119.000 TND` fee) `SETTLED` via signed webhooks & `MATCHED` reconciliation |
| **Gate E** | Reliability & fault recovery | **PASS** | `dhmad-payments.scenarios.ts`, `FOR UPDATE SKIP LOCKED` durable inbox, `AMBIGUOUS_QUARANTINED` recovery, `lastSyncedAt` asc reconciliation, `409` duplicate payout block |
| **Gate F** | Security & sandbox isolation | **PASS** | `DHMAD_EXPECTED_SELLER_EMAIL` fail-closed, allowlist proxy (`403` on `/metrics` & `/api/v1/admin/*`), `sk_live_` & `REAL_PAYOUTS_ENABLED=true` blocked |
| **Gate G** | CI/CD & permanent Felcloud staging | **BLOCKED** | Local suites pass; GitHub `sandbox-qualification` environment secrets, hosted CI run, permanent Felcloud staging VM/DNS, and `jq` for `test-release-provenance.py` remain unprovisioned |
| **Gate H** | Recovery & operations | **PASS** | Populated `pg_dump`/`pg_restore` drill (`4129 ms`, all 9 payment/ledger/audit tables preserved); runbook completed in `docs/07-operations/dhmad-payments-operations.md` |

## 3. Verified Commands & Live Runs
- `pnpm lint`: exit `0` (`0` errors).
- `pnpm typecheck`: exit `0`.
- `pnpm test`: exit `0` (`@nasj/api` + `@nasj/web` including `payment-escrow-panel.test.ts`).
- `pnpm test:integration`: exit `0` (`225` scenarios passed).
- `python3 scripts/deploy/test-schema.py`, `bash scripts/deploy/test-deploy.sh`, `python3 scripts/deploy/test-delivery-workflow.py`: exit `0` (`test-release-provenance.py` blocked on missing `jq`).
- Live DHMAD sandbox B2C (`ef42cbd2316747e7b46cff59`) & B2B (`6525e3dc37dc46c69bd7353d`) lifecycles via `https://primal-landed-magnify.ngrok-free.dev`: `SETTLED`, `MATCHED`, `balanced: true`.

## 4. GitHub Backlog Status
- Epic `#271` and stories `#147`, `#272`–`#280` remain **OPEN** until Gate G (hosted CI `sandbox-qualification` + permanent isolated Felcloud staging) passes.
