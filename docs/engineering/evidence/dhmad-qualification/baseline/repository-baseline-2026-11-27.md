# DHMAD qualification repository baseline — 2026-11-27

This is the baseline for the NASJ × DHMAD sandbox mission, captured before implementation edits.

## Repository and working state

| Item | Observation |
|---|---|
| Repository | `/home/ashenix/Projects/nasj/website`, GitHub `wie-challenge/website` |
| Starting commit | `ce26278c4311d26479b75e8df710ee36d2f3762b` |
| Starting tree | Clean (`git status --short --branch` reported `main...origin/main`, no changes) |
| Active branch | `feat/dhmad-sandbox-integration`, created from the starting commit |
| Existing worktrees | Qualification detached worktree at `cc410ab`; deployment-availability, workspace-docs, AI-pilot, plan-only, preserved-website, and operations worktrees |
| Production | No production action performed |
| Credentials | No environment variable with `DHMAD`, `PAYMENT`, or `ESCROW` in its name was present; values were not read |

The original `main` working tree was clean before the branch was created. No files in the active
qualification directory or its worktree were modified.

## Qualification protection

The root qualification directory contains `.qualification.Do1qD0/qualification.flock`, a running
`flock` process, a QEMU guest, and an active repeat-11 cutover/load trial. At capture, the repeat-11
script, SSH tunnel, guest measurement, and 60-second native load process were running. The observed
qualification activity is active and protected. Its lock, inputs, processes, VM, and retained evidence
were not changed.

## Existing application architecture

Confirmed from repository files at the starting commit:

- Next.js web app, NestJS API, shared Zod contracts, Prisma 7, PostgreSQL, and a database-local worker.
- No existing DHMAD provider module, DHMAD environment setting, or payment-provider adapter was found.
- Procurement already stores RFQs, versioned quotations, cost estimates, buyer acceptance snapshots,
  commercial orders, artisan offers, production, QA, logistics, delivery reports, and buyer acceptance.
- Finance already has exact millime arithmetic, artisan payables, payout requests, manual execution
  reports, financial adjustment/event records, and simulated settlement records.
- Existing payment/settlement records are synthetic by design. Database constraints prohibit promoting
  a simulated settlement or manual execution report to verified payment.
- Existing workflow files are `ci.yml`, `checks.yml`, `pr.yml`, `scheduled.yml`,
  `infrastructure-ci.yml`, and `infrastructure-apply.yml`.
- Current status documentation says no independently verified payment provider exists. D1 and the
  relevant financial authority remain an external gate in existing project documentation.

Repository references: `docs/00-project/current-status.md`, `docs/01-product/finance-and-settlement.md`,
`docs/02-architecture/commerce-domain.md`, `docs/02-architecture/system-overview.md`,
`apps/api/prisma/schema.prisma`, `apps/api/src/modules/procurement/`, and
`apps/api/src/modules/finance/`.

## External governance observations

- GitHub open PR search showed unrelated ongoing work, including #270 (assistant pilot) and #263
  (read-only infrastructure plan identity). No PR was changed.
- Existing issue #147, “Approved Payment Provider Integration,” is **closed** and is a provider-integration
  backlog item. Existing parent epic #11 covers buyer finance, artisan payables, payouts, and settlement.
  No payment issue was created or closed during baseline capture.
- Issue #147 was closed on 2026-11-19 even though current repository status still describes provider
  integration as absent. Do not infer acceptance from that closed state.

## Verification performed

Read-only commands and sources:

- `git status --short --branch`
- `git rev-parse HEAD`
- `git worktree list --porcelain`
- `ps -eo pid,ppid,stat,etime,cmd` filtered for qualification workloads
- `rg` searches across code, schema, docs, environment variable names, and workflows
- GitHub connected searches for open payment issues and pull requests
- Official DHMAD documentation index and sandbox guide, retrieved 2026-11-27

This baseline makes no claim about hosted CI, a staging host, VPS resources, production state, or a
successful sandbox API transaction.
