# E16 engineering report — current implementation

The initial repository provided identity, organization, artisan and governance foundations. The first E16 pass added replay/outbox/worker/operations hardening and documented missing commerce. The user then specifically requested completion of **#32, #88 and #195**. The current implementation adds a bounded persisted synthetic commerce workflow from the product's documented states/rules and completes these three stories without rebuilding the existing architecture or claiming unrelated epics.

## Requested stories

| Issue | Status | Implemented result |
|---|---|---|
| #32 / E16-01 | COMPLETE | Pure guarded RFQ/order/offer/batch/payment machines; exact millimes; capacity/allocation, cumulative production, QA/reinspection, separate synthetic settlement and closure invariants; authoritative transactional API integration and concurrent/boundary/property-style tests |
| #88 / E16-02 | COMPLETE for implemented synthetic journeys | Actual buyer RFQ, artisan voluntary decision/progress and operator/QA/fulfillment pages; mobile/desktop/keyboard/focus/errors/reduced motion, eight zero-violation axe checkpoints, emulated slow CPU/network and captured layout review |
| #195 / E16-04 | COMPLETE | Repository-local setup/API/architecture/security/testing/firmware/deployment/operations guides, genuine commands, state/money/role contracts, synthetic and hardware limits, accurate cold-install blocker evidence |

[The targeted acceptance report](E16_TARGET_STORIES_REPORT.md) maps every criterion to code and verification. [The full acceptance matrix](E16_ACCEPTANCE_MATRIX.md) preserves all twelve stories; no other story is automatically declared complete. Initial investigation is preserved in [the baseline audit](E16_IMPLEMENTATION_AUDIT.md).

## Architecture and changes

Next protected commerce pages use the existing same-origin API boundary and shared strict contracts. Nest's new commerce module derives current resource roles and invokes pure rules inside the established Prisma IAM transaction. Six additive related commerce tables store synthetic RFQs, exact quote-derived orders, immutable offers, cumulative batches, versioned inspection attempts and separate payment kinds. Required actor/resource/operation/payload-bound command outcomes, version checks, audit and metadata outbox commit with each mutation. No client component reads the database. [Architecture and equations](../architecture/commerce.md).

The UI preserves the existing forms/cards/design language, with native labels/details/textareas, visible focus, status/error announcements, responsive fact layouts and explicit simulation labels. Unknown monitoring fields/live provenance are rejected; personal financial projections are role-scoped. Unsupported amendment/dispute remedies and real-money paths cannot be enabled through status manipulation.

## Executed evidence

**34 unit tests, 54 real PostgreSQL/SMTP integration scenarios and 14 Chromium browser tests pass.** Lint (154 files), strict typecheck, production build and dependency audit pass. Eight axe checkpoints report zero detected violations. Mobile uses 360px/4× CPU/150ms latency/limited throughput; desktop 1280px; existing 320px keyboard login remains. Actual captured mobile output was visually inspected. These are scoped automated/observed results, not full WCAG/physical-device certification.

The actual isolated dump/restore compares **31 tables / 579 synthetic rows** by counts/hashes, including commercial history and exact payment records. Cold-source offline installation lacked a cached tarball; the network retry still timed out at dependency download. Subsequent clean-source commands were not executed. Documentation records this explicit environment limitation; installed-workspace/disposable startup checks are not relabelled as cold-install success.

See [test results/raw evidence](E16_TEST_RESULTS.md) and [security results](E16_SECURITY_TEST_REPORT.md). Failed intermediate checks were repaired and are distinguished from final passes. No secrets, environment files or backup archives are committed.

## Release and remaining scope

[Release readiness](E16_RELEASE_READINESS.md): Release A is **CONDITIONAL GO for synthetic engineering validation**, pending cold-install and broader owner review. Release B remains **NO-GO for the complete competition release** because firmware/deployed-provider/other product evidence is outstanding. Real contracts, payments/accounting, advanced remedies, external event delivery, ETL, production backup/alert policy and hardware/local-summary verification remain outside these three completed stories.

These reports record local verification. No merge, application deployment, GitHub issue closure, production write or live financial transaction was performed.
