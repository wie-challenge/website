# E16 acceptance matrix — 2026-10-20

Requirement text is copied from authenticated GitHub issue snapshots in `issues/`. All 13 issue bodies were retrieved; 12 comment lists were empty; #197 comments endpoint repeatedly failed, while its issue metadata reports zero comments. No issue status was changed. A closed/checked upstream issue is not treated as a local test pass.

## Story inventory and outcomes

| Story / issue | Initial | Final | Actual implementation | Important files | Remaining limits |
|---|---|---|---|---|---|
| E16-01 [#32](https://github.com/wie-challenge/website/issues/32) | MISSING | COMPLETE | All five pure guarded commerce machines, exact TND and transactional allocation/production/QA/settlement. | contracts/src/commerce; API commerce module; commerce migration/unit/integration/browser tests | Synthetic-only; amendment/dispute remedies and real payments are deliberately blocked rather than fabricated. |
| E16-02 [#88](https://github.com/wie-challenge/website/issues/88) | PARTIAL | COMPLETE | Buyer RFQ, artisan decisions/progress and operator review at mobile/desktop with keyboard, axe, reduced-motion and slow-device emulation. | commerce-workspace.tsx; protected commerce pages; globals.css; commerce.spec.ts | Tested Chromium scope; no blanket WCAG/cross-browser/physical-device certification. |
| E16-03 [#194](https://github.com/wie-challenge/website/issues/194) | PARTIAL | PARTIAL | Seeded synthetic commerce API-to-closure and browser-to-delivery journeys, role/quantity/QA/payment/replay failures. | commerce fixture/scenarios/browser tests; existing integration suite | Hosted CI not executed; broader product evidence/fixtures remain separate from the three requested stories. |
| E16-04 [#195](https://github.com/wie-challenge/website/issues/195) | PARTIAL | COMPLETE | Repository-local guides for setup, APIs, architecture, firmware limitations, tests, deployment and operations. | README.md; docs/{architecture,api,development,deployment,security,testing,firmware,operations} | Cold source install attempt failed registry timeout; explicitly documented. No unavailable firmware instructions invented. |
| E16-05 [#78](https://github.com/wie-challenge/website/issues/78) | PARTIAL | COMPLETE | Existing independent Nest session/RBAC/CSRF/rate/validation boundaries verified and replay header bounded; browser proxy rejection regression. | artisans.controller.ts; foundation/idempotency.ts; app.ts; integration and browser tests | Complete for existing website routes. No upload/commercial endpoint exists. Production ingress/provider credentials remain unverified. |
| E16-06 [#75](https://github.com/wie-challenge/website/issues/75) | MISSING | PARTIAL | Capacity and all new commerce commands use durable actor/resource/operation/payload-bound outcomes, with reauthorization and version checks. | CommandOutcome; replaySafe; commerce service; browser retry | Existing non-commerce create/action endpoints and external providers still need durable integration/retention review. |
| E16-07 [#76](https://github.com/wie-challenge/website/issues/76) | PARTIAL | PARTIAL | Existing IAM audit helper atomically writes metadata events; retryable local receipt consumer deduplicates delivery. | foundation/audit.ts; jobs/outbox.ts; migration; test/e16.scenarios.ts | Commercial mutations are now transaction-bound; external publication/notification and historical backfill remain absent. Not exactly-once. |
| E16-08 [#77](https://github.com/wie-challenge/website/issues/77) | PARTIAL | PARTIAL | Request durations; operational alert codes; genuine disposable pg_dump/restore and all-table count/hash verification; runbook. | app.ts; jobs/alerts.ts; scripts/check-operations.ts; test/restore.scenarios.ts; docs/operations | Production owner/RPO/RTO/retention/storage/alert routing unapproved; no commercial ledger or off-site recovery verification. |
| E16-09 [#79](https://github.com/wie-challenge/website/issues/79) | PARTIAL | PARTIAL | Existing organization/nested/role/delegation negatives rerun; new replay consent/session/ownership denial with unchanged rows. | test/e16.scenarios.ts; existing organization/artisan/lifecycle scenarios; browser tests | Synthetic commerce tenant/role/money projections now tested; private files/downloads and device non-upload remain outside current implementation. |
| E16-10 [#196](https://github.com/wie-challenge/website/issues/196) | MISSING | PARTIAL | Database-local bounded worker, skip-locked concurrency, retry/failure states, idempotent receipts, duration/lag/status and alert rules. | jobs/{outbox,main,alerts}.ts; EventReceipt schema; scripts/check-operations.ts | No commercial ETL/rebuild/provenance contract; depends on E13-02. Queue must stay private, not a commercial evidence source. |
| E16-11 [#30](https://github.com/wie-challenge/website/issues/30) | PARTIAL | PARTIAL | Existing locked foundation preserved; additive migration, compiled worker command, full checks and CI evidence collection. | package.json; apps/api/package.json; Prisma migration; .github/workflows/ci.yml | Issue was already closed with checked criteria; this audit independently records cold install timeout and unrerun canonical persistent dev entrypoint. |
| E16-12 [#197](https://github.com/wie-challenge/website/issues/197) | BLOCKED | BLOCKED | Software privacy cases executed and firmware/simulator/physical matrix documented separately. | docs/firmware/README.md; artisan/E16 integration tests; issue snapshot | No firmware source/device/algorithm/local-summary contract. E12 dependencies absent; comments endpoint EOF, issue reports zero comments. |

## Per-criterion disposition

PASS refers only to the evidence stated, not blanket release readiness. BLOCKED marks unavailable upstream prerequisites; PARTIAL records unmet portions explicitly.

| Criterion | GitHub acceptance text | Disposition | Evidence / limitation |
|---|---|---|---|
| E16-01.1 | Unit tests for transitions, decimal amounts and allocation invariants. | PASS | Exhaustive state/role edges, exact TND, allocation and deterministic 500-partition cases in commerce-domain.test.ts. |
| E16-01.2 | Encode guarded RFQ/order/offer/batch/payment transitions independently of UI. | PASS | Five typed machines in pure contracts/src/commerce/domain.ts; all matching Nest commands invoke them transactionally. |
| E16-01.3 | Implement exact TND arithmetic with documented rounding and units. | PASS | Integer millimes in domain/API/DB, bounded TND string serialization/HALF_UP; exact quote and payout persisted assertions. |
| E16-01.4 | Enforce allocation, production, QA and settlement reconciliation invariants. | PASS | Actual capacity/order reservation, monotone cumulative production, immutable QA reconciliation and separate payment/closure limits. |
| E16-01.5 | Test valid/invalid paths, boundary amounts, duplicate operations and impossible quantities. | PASS | Concurrent replay/decisions/reservations, stale versions, expiry, overproduction, QA mismatch/rework, overpayment and closure denial tests. |
| E16-02.1 | Keyboard and small-screen critical flows tested; reduced-motion honored. | PASS | 360/1280px commerce journeys, 320px login, keyboard activation/focus and inline-animation reduced-motion assertion. |
| E16-02.2 | Make buyer RFQ, artisan decisions/progress and operator review usable on small screens. | PASS | Real persisted buyer RFQ, voluntary offer/progress and operator/QA/fulfillment screens; no horizontal overflow. |
| E16-02.3 | Provide labels, keyboard controls, visible focus and understandable validation. | PASS | Native labels/forms/details/textareas, visible focus, safe announced validation and recoverable network errors; axe checkpoints. |
| E16-02.4 | Respect reduced motion and provide accessible text alternatives/status announcements. | PASS | Reduced-motion override, text-first facts, loading/empty states and role=status/alert; eight axe checkpoints. |
| E16-02.5 | Test representative low-end device/browser conditions and fix blocking barriers. | PASS | Mobile Chromium 4x CPU, 150ms latency, constrained throughput; actual synthetic journey and captured layout inspected. Emulated, not physical. |
| E16-03.1 | Order, offer, inspection, simulated settlement and reset pass. | PASS | RFQ/order/offer/inspection/synthetic settlement persisted in disposable integration fixtures. |
| E16-03.2 | Exercise one order from RFQ through quote, offers, progress, QA, shipment and simulated payment. | PASS | API suite completes RFQ through synthetic financial closure; browser journeys exercise real shipment/delivery. |
| E16-03.3 | Verify decline/reallocation, excess quantity, rejected-unit shipping and duplicate payment protections. | PASS | Concurrent excess reservation, decline/expiry/reallocation, QA mismatch/rework/shipment guards and duplicate payments covered. |
| E16-03.4 | Run role/tenant denial cases and deterministic reset. | PASS | Two buyers, operator, artisan and QA identities plus disposable deterministic fixture resets. |
| E16-03.5 | Produce repeatable CI results with fixture version and useful failure artifacts. | PARTIAL | commerce-v1 fixtures and local repeatable tests/axe JSON/screenshots; hosted CI is configured but not executed. |
| E16-04.1 | README includes start, migrations, environment, firmware setup, API contracts, tests, deployment and demo limitations; never commit secrets. | PASS | Root README links self-contained setup/API/firmware/tests/deployment/limitations guides. |
| E16-04.2 | Document prerequisites, workspace commands, environment example, migrations and seed. | PASS | Pinned toolchain and genuine existing commands documented; frozen install in workspace passed. |
| E16-04.3 | Explain Next.js/NestJS boundaries, permissions, business states and error contracts. | PASS | Architecture/API/security guides describe actual boundaries, states and safe error envelopes. |
| E16-04.4 | Include firmware board/wiring/build instructions or clearly labeled unavailable hardware. | PASS | Firmware guide explicitly marks missing board/wiring/build/hardware; no fabricated instructions. |
| E16-04.5 | Document tests, deployment, reset, limitations and synthetic-data conventions without secrets. | PASS | Testing/deployment/operations guides distinguish synthetic data and unsupported recovery/commerce. |
| E16-05.1 | Zod validation, rate limits, resource-level RBAC and error contracts. | PASS | Existing and E16 actual API validation/rate/RBAC/error tests. |
| E16-05.2 | Validate payload/query schemas and return consistent safe errors. | PASS | Strict contracts and existing pagination/malformed/size tests pass. |
| E16-05.3 | Enforce session, resource authorization and rate limits on authoritative NestJS endpoints. | PASS | Nest session/permission/rate checks independent of UI. |
| E16-05.4 | Secure any Next.js proxy/server boundary against unauthorized forwarding and CSRF where applicable. | PASS | Browser proxy denies unauthenticated/malformed requests; existing server-side and CSRF tests pass. |
| E16-05.5 | Reject unknown monitoring fields, invalid IDs and unbounded list/upload requests. | PASS | Explicit wearable fields, invalid identifiers and unbounded lists rejected. Uploads NOT APPLICABLE: no upload endpoint. |
| E16-06.1 | Repeated command/webhook does not create duplicate liabilities or status transitions. | PARTIAL | Capacity and all new commerce commands deduplicate persisted transitions; external webhook/real-liability integration remains outside this prototype. |
| E16-06.2 | Define idempotency key scope, payload binding, retention and replay response. | PASS | Actor/profile/operation binding, payload digest, original response and indefinite default retention documented. |
| E16-06.3 | Apply deduplication to acceptance, reservations, progress, payables and settlement recording. | PARTIAL | Synthetic acceptance/reservation/progress/QA-earned obligations/settlement now use durable outcomes; real payable/provider integration remains separate. |
| E16-06.4 | Reject key reuse with conflicting payload and make concurrent identical commands safe. | PASS | Six concurrent identical requests and changed-quantity 409; one audit/event/outcome. |
| E16-06.5 | Preserve operation outcomes across transient failures without duplicate domain events. | PASS | Forced transaction rollback followed by retry; committed response lost and browser retry returns one row. |
| E16-07.1 | Order and audit update atomic, retry-safe notifications. | PARTIAL | IAM and synthetic order mutations/audit/outbox atomic; external notification remains separate. |
| E16-07.2 | Commit business mutation, critical audit and outbox event in the same database transaction. | PASS | IAM audit helper integration and forced rollback test. |
| E16-07.3 | Publish notifications/jobs after commit with retryable delivery and unique event IDs. | PARTIAL | Versioned unique events delivered after commit to internal receipts; external notifications not implemented. |
| E16-07.4 | Deduplicate consumers and handle failure without losing or duplicating domain effects. | PASS | Savepoint rollback, failure budget, concurrent consumer and duplicate delivery tests. |
| E16-07.5 | Redact secrets/personal payloads and record observable outbox failure state. | PASS | Fixed error codes; event schema excludes snapshots/reasons and sentinel test verifies boundary. |
| E16-08.1 | Recovery target, log redaction and alert tests documented. | PARTIAL | Alert thresholds tested; proposed recovery targets and redaction conventions documented, not approved. |
| E16-08.2 | Define reviewed recovery-time/recovery-point targets and backup ownership. | BLOCKED | Deployment owner must approve recovery targets/ownership. |
| E16-08.3 | Produce protected backups and execute a restore into an isolated environment. | PARTIAL | Real protected temporary archive restored in disposable DB; encrypted off-host production backups not provisioned. |
| E16-08.4 | Capture structured redacted logs, health checks and actionable alerts. | PARTIAL | Structured safe logs/health/alert codes verified; hosted alert routing not configured. |
| E16-08.5 | Document incident/rollback procedures and verify restored ledger consistency. | PARTIAL | Runbook and all-table restore hashes verified; no commercial balances exist to reconcile. |
| E16-09.1 | Cross-tenant access denied in automated tests. | PARTIAL | Organization/artisan and synthetic buyer/operator/QA tenant denials pass; broader files/exports remain outside scope. |
| E16-09.2 | Test list/detail/create/update/download authorization across two organizations and artisan identities. | PARTIAL | Foundation and synthetic commercial projections/create/actions/nested-batch scopes covered; private downloads absent. |
| E16-09.3 | Cover nested IDs, association delegation, role changes and admin scopes. | PASS | Actual association delegation/role/admin cases and revocation tests. |
| E16-09.4 | Verify denials reveal no protected payload and produce no unauthorized mutation. | PASS | Denial/persisted row assertions, safe envelopes and sentinel checks. |
| E16-09.5 | Confirm commerce exposes no individual wearable read path. | PARTIAL | No individual wearable route exists in commerce; strict schemas reject monitoring fields. Physical device traffic remains unverified. |
| E16-10.1 | Asynchronous processing is observable, retryable and does not affect core ledger. | PARTIAL | Local queue failure/recovery observability implemented; no ledger/ETL exists. |
| E16-10.2 | Introduce queues only for justified asynchronous workloads. | PASS | No broker introduced; existing IAM audits supply metadata event stream for local receipt delivery. |
| E16-10.3 | Version event contracts and support bounded retries, dead-letter inspection and replay. | PASS | Version 1, five-attempt budget, failed diagnostics and selective operator replay. |
| E16-10.4 | Make analytics rebuildable from authoritative sources without writing ledger balances. | BLOCKED | Commercial sources, provenance and E13-02 ETL contract absent. |
| E16-10.5 | Enforce purpose/tenant scopes and expose lag/failure metrics. | PARTIAL | Private tenant metadata, lag/counts/failures provided; purpose-scoped analytics endpoints absent. |
| E16-11.1 | pnpm workspace, TypeScript, Prisma migrations, env example, seed, lint, typecheck, tests and one-command local setup succeed in clean checkout. | PARTIAL | Workspace frozen install/full gates pass; cold snapshot install timed out at registry. |
| E16-11.2 | Scaffold pnpm Next.js/NestJS workspace with shared domain/contracts packages. | PASS | Existing Next/Nest/contracts workspace preserved; pure domain module added. |
| E16-11.3 | Define PostgreSQL/Prisma schema, versioned migrations and isolated synthetic seed. | PASS | Six reviewed versioned migrations now apply to disposable synthetic fixtures; no destructive schema rewrite. |
| E16-11.4 | Provide env example, startup, lint, typecheck and test commands without secrets. | PASS | Existing env/start/check commands plus worker and ops commands documented without secrets. |
| E16-11.5 | Verify clean installation, migration and startup with documented pinned runtime assumptions. | PARTIAL | Fresh migrated disposable services start and browser journeys pass; cold registry install and canonical dev rerun outstanding. |
| E16-12.1 | Test valid/invalid IMU, threshold, rest/reset, motor, disconnect, false alerts, capacity opt-in and network non-upload; record actual outcomes. | PARTIAL | Website privacy/capacity opt-in executed; IMU/motor/network device behavior blocked. |
| E16-12.2 | Cover valid/invalid IMU, threshold boundary, rest/reset, cooldown and motor behavior. | BLOCKED | No firmware algorithm/build contract or hardware. |
| E16-12.3 | Include disconnect/reconnect, false reminders, local deletion and capacity independence. | BLOCKED | No device/local-summary/reminder/storage implementation. |
| E16-12.4 | Record expected/observed results, firmware/app version and physical versus simulator evidence. | PARTIAL | Software fixture/version and evidence categories recorded; no observed firmware/hardware result. |
| E16-12.5 | Mark unavailable hardware tests blocked rather than passing from synthetic evidence. | PASS | Every unavailable simulator/hardware row explicitly BLOCKED; no simulated output claimed as physical. |

## Validation mapping

- Pure domain: `apps/api/test/unit/domain.test.ts`; operations: `test/unit/operations.test.ts` (`pnpm test`).
- Existing boundaries/tenant/roles: `test/integration.ts`, organization/artisan/governance/lifecycle/MFA scenarios (`pnpm test:integration`).
- Replay/atomicity/worker: `test/e16.scenarios.ts`; restore: `test/restore.scenarios.ts` (same integration command).
- Browser/mobile/keyboard/proxy/lost-response: `tests/e2e/{foundation,identity}.spec.ts` (`pnpm test:e2e`).
- Exact execution evidence and quality gates: `E16_TEST_RESULTS.md`; risks/security: `E16_SECURITY_TEST_REPORT.md`; A/B decisions: `E16_RELEASE_READINESS.md`.
- Architecture diagram and money/quantity/transition semantics: `../architecture/README.md`.
