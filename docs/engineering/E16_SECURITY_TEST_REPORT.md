# E16 security test report — 2026-10-20

Current scope includes the completed #32/#88/#195 synthetic prototype, existing foundation and actual PostgreSQL/SMTP/Chromium checks. No production provider, real financial or physical hardware claim. The original audit/issue snapshots remain historical evidence; this report supersedes the earlier statement that commerce was absent.

| Protection | Actual execution evidence | Result / limits |
|---|---|---|
| Authentication | Anonymous/forged/expired/revoked sessions, disabled/unverified accounts, MFA and replay expiry tests | PASS for implemented routes; production ingress/provider configuration unverified |
| Input and request boundaries | Origin/JSON/CSRF/size/pagination/rate tests; strict unknown wearable/provenance/mass-assignment/quantity rejection; browser proxy denials | PASS |
| Tenant/role/object isolation | Existing organization/nested/delegation scenarios plus buyer/other-buyer/operator/QA/artisan commercial identities | PASS tested scope; buyer drafts private, substituted owners/batches/roles denied |
| Financial privacy | Buyer workspace omits artisan offers/payouts; artisan omits buyer quote/receipts; QA receives no individual money values/payment records | PASS actual API projections |
| Voluntary participation | Operator/outsider cannot accept offer; owner decline/expiry releases tentative capacity without penalty; rework needs explicit owner acceptance | PASS |
| Concurrent state integrity | Concurrent RFQ/quote acceptance/offer decision/progress/replay and conflicting reservations; unique order/batch/inspection/outcome constraints | PASS on actual PostgreSQL |
| Exact money/counts | Integer millimes, immutable pay snapshot, monotone cumulative progress/QA approvals, excess allocation/production/QA/shipment/settlement denial | PASS unit/property-style + persisted integration |
| Obligations and closure | Separate buyer receipts/QA-earned artisan obligations, failed/cancelled history, pending-payment cancellation and unpaid/disputed closure guards | PASS synthetic scope; no live liabilities or bank execution |
| Atomicity and events | Forced transaction rollback/retry; all commercial audits have matching metadata outbox; receipt consumer failure/retry/dedup | PASS local DB scope; external SMTP not claimed replay-safe |
| Privacy boundary | Unknown explicit wearable fields rejected; private sentinel reason/snapshot excluded from event rows | PASS typed boundary; arbitrary free text is not semantically classified |
| Dependency audit | `pnpm audit --audit-level=high` | PASS: no known vulnerabilities at execution |

New commerce errors use safe fixed domain codes/messages, not raw database exceptions. Required command keys and versions are checked independently of UI. Replays reauthorize against current membership/owner/session before returning private saved outcomes. All commercial records and payment evidence are synthetic-only in both contracts and DB CHECK constraints. The test-only fixture/control server is absent from production module imports.

Residual risks: global IAM locks serialize correctly but constrain throughput; outcomes/events need an approved retention policy; production DB grants/TLS/provider controls, encryption/off-site recovery and alert destinations require deployment configuration. Advanced amendment/dispute resolution, partial-fulfillment contract remedies, comprehensive accounting and live payment integration are not supplied by these three issues. Firmware/private local summaries and device packet-capture verification remain blocked. No independent penetration test, physical device test or complete screen-reader/WCAG certification was performed.
