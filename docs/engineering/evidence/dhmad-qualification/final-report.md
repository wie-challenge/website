# NASJ × DHMAD Sandbox Integration — Qualification Report (2026-11-27)

## 1. Executive Summary
- **Commercial Architecture**: Implemented central NASJ-recipient escrow (`DHMAD_EXPECTED_SELLER_EMAIL` enforced fail-closed; `developerFeePercentage` unused), dynamic per-request multi-artisan financial allocations (`GROSS` | `AFTER_MATERIALS` | `AFTER_DIRECT_COSTS`, integer millimes and basis points), immutable approved snapshots locking on escrow funding, append-only double-entry journal, artisan payables, and strictly simulated payouts (`REAL_PAYOUTS_ENABLED=false`, live payments disabled).
- **Qualification Outcome**: Local offline, mock-provider, PostgreSQL schema/migration, ledger trigger, integration (225/225), unit, lint, build, release provenance (`38/38` with `jq`), Playwright Chromium browser E2E/a11y/RTL (`3/3`), hosted `Checks` (`46004219664` on `544a00f`), financial backup/restore, **and live authenticated DHMAD B2C + B2B + multi-artisan sandbox lifecycles via isolated `ngrok` staging** all **PASSED** (`AUTHENTICATED_SANDBOX_PASS`).
- **Remaining Gates**: GitHub `sandbox-qualification` environment secrets & hosted CI execution (`dhmad-sandbox-qualification.yml`), permanent isolated Felcloud staging deployment (`nasj-staging.ddns.net` DNS pending), and DHMAD Support cancellation/refund of stranded pre-`fc96e0b` sandbox escrow `6b09693ccf721af3c72d7412`.
- **Safety & Isolation**: Unrelated AI-P2 mission artifacts (`.qualification.Do1qD0`, `.worktrees/nasj-deployment-availability`), `main`, and production (`https://nasj-platform.ddns.net`) were left completely untouched.

## 2. Qualification Gate Matrix

| Gate | Scope | Status | Evidence / Outcome |
| :--- | :--- | :--- | :--- |
| **Gate A** | Repository & infrastructure safety | **PASS** | `feat/dhmad-sandbox-integration` (`544a00f`), AI-P2 lock/VM and production untouched |
| **Gate B** | Authenticated DHMAD provider feasibility | **PASS** | `AUTHENTICATED_SANDBOX_PASS`: `sandbox-preflight.ts`, live `createEscrow`, `getEscrow`, `getContract`, `createCheckoutSession`, `deliverEscrow`, `createIdentityVerification`, `cancelEscrow` |
| **Gate C** | Financial correctness | **PASS** | `FinancialPlanSnapshot` DB triggers, B2C maker-checker override guard, `trial-balance` `balanced: true` (`9275.000 TND`), B2B fee variance (`100` est vs `119 TND` actual → `581.000 TND` remaining contribution), multi-artisan 30% + 25% allocation & simulated payouts |
| **Gate D** | Complete functional integration (B2C + B2B + UI) | **PASS** | Live B2C (`ef42cbd2316747e7b46cff59`) & B2B (`6525e3dc37dc46c69bd7353d`) `SETTLED` & `MATCHED`; `#272` Playwright E2E (`3/3` Chromium: buyer/artisan/admin isolation, FR/AR RTL, Axe WCAG AA 0 violations, 390×844 mobile) |
| **Gate E** | Reliability & fault recovery | **PASS** | `dhmad-payments.scenarios.ts`, `FOR UPDATE SKIP LOCKED` durable inbox, `AMBIGUOUS_QUARANTINED` recovery, `lastSyncedAt` asc reconciliation, `409` duplicate payout block; stranded `6b09693ccf721af3c72d7412` documented for DHMAD Support |
| **Gate F** | Security & sandbox isolation | **PASS** | `DHMAD_EXPECTED_SELLER_EMAIL` fail-closed, allowlist proxy (`403` on `/metrics` & `/api/v1/admin/*`), `sk_live_` & `REAL_PAYOUTS_ENABLED=true` blocked |
| **Gate G** | CI/CD & permanent Felcloud staging | **IN PROGRESS / BLOCKED** | Hosted `Checks` (`46004219664` on `544a00f`) and local `test-release-provenance.py` (`38/38`) **PASS**; GitHub `sandbox-qualification` environment/secrets and `nasj-staging.ddns.net` DNS remain unprovisioned externally; Option A Felcloud staging provisioning in progress |
| **Gate H** | Recovery & operations | **PASS** | Populated `pg_dump`/`pg_restore` drill (`4129 ms`, all 9 payment/ledger/audit tables preserved) + post-restore external provider reconciliation (`checkedCount: 3, matchedCount: 3, discrepancyCount: 0`); runbook in `docs/07-operations/dhmad-payments-operations.md` |

## 3. Verified Commands & Live Runs
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (`225/225`): exit `0`.
- `Checks` hosted CI (`46004219664` on `544a00f`): **PASS** (`quality`, `workflow-lint`, `sast`, `audit`, `secrets-new`).
- `python3 scripts/deploy/test-release-provenance.py`: **PASS** (`38/38` with `/usr/bin/jq`).
- `pnpm exec playwright test tests/e2e/dhmad-payment-ui.spec.ts`: **PASS** (`3/3` Chromium).
- Live DHMAD sandbox B2C (`ef42cbd2316747e7b46cff59`) & B2B (`6525e3dc37dc46c69bd7353d`) lifecycles via `https://primal-landed-magnify.ngrok-free.dev`: `SETTLED`, `MATCHED`, `balanced: true`.

## 4. GitHub Backlog Status
- **Closed**: `#272`, `#273`, `#274`, `#275`, `#277`, `#278`, `#279`, `#280`.
- **Open (pending Gate G)**: `#147`, `#276`, and Epic `#271`.
