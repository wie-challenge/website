# DHMAD Sandbox Payments & Financial Allocation Operations

> **Sandbox only.** Live money collection (`NODE_ENV=production` + `PAYMENTS_ENABLED=true`) and real artisan payouts (`REAL_PAYOUTS_ENABLED=true`) are structurally blocked in configuration, database constraints, and application guards.

## 1. Commercial and Technical Model

1. **Central NASJ recipient**: Buyers pay NASJ through a single DHMAD escrow per order (`PaymentObligation` -> `ProviderEscrow`). `sellerEmail` is omitted on `POST /api/v1/escrows` so DHMAD uses NASJ's associated developer user account. `developerFeePercentage` is never used as NASJ's revenue mechanism.
2. **Request-specific artisan compensation**: NASJ determines each artisan's share (`basisPoints` out of `10000`) and calculation base (`GROSS`, `AFTER_MATERIALS`, `AFTER_DIRECT_COSTS`) per request via `FinancialPlanSnapshot` (B2B, maker/checker) or `B2cFinancialPlan` (B2C). All money uses integer TND millimes (`1 TND = 1,000 millimes`).
3. **Immutable lock**: Approving a `PaymentObligation` locks the financial plan; post-lock amendments are rejected (`409 FINANCIAL_PLAN_LOCKED`).
4. **Delivery protection**: `POST /api/v1/payments/obligations/:id/deliver` requires verified physical delivery evidence (`DeliveryReport` in B2B, `DELIVERED` status in B2C). Shipment alone cannot start DHMAD's review window (`72h` B2C, `168h` B2B).
5. **Append-only double-entry subledger**: `JournalBatch` and `JournalEntry` enforce `SUM(DEBIT) = SUM(CREDIT)` via PostgreSQL deferred constraint trigger and reject `UPDATE`/`DELETE`.
6. **Simulated payouts only**: `ArtisanPayoutSimulation` enforces `isSimulated = true`, `mode = 'SIMULATION'`, and `provenance = 'SIMULATED_SANDBOX_ONLY'`.

## 2. Sandbox Credential Setup (Required for Authenticated Qualification)

Configure locally in `.env` (never commit) or in the protected GitHub `sandbox-qualification` environment:

```dotenv
PAYMENTS_ENABLED=true
PAYMENT_PROVIDER=dhmad
DHMAD_ENVIRONMENT=sandbox
DHMAD_BASE_URL=https://sandbox.dhmad.tn/api
DHMAD_API_KEY=sk_sandbox_...
DHMAD_WEBHOOK_SECRET=...
DHMAD_EXPECTED_SELLER_EMAIL=...
PAYMENT_B2C_REVIEW_HOURS=72
PAYMENT_B2B_REVIEW_HOURS=168
PAYMENT_RECONCILIATION_ENABLED=true
ARTISAN_PAYOUT_MODE=simulation
REAL_PAYOUTS_ENABLED=false
```

In the DHMAD developer dashboard (`https://developer.dhmad.tn`), verify:
1. Developer account is associated with NASJ's sandbox user account (`https://sandbox.dhmad.tn`) matching `DHMAD_EXPECTED_SELLER_EMAIL`.
2. `PUBLIC_APP_URL` callback URLs (`/orders`, `/procurement`) are allowlisted under **Settings → Allowed Redirect URLs**.
3. Webhook endpoint `POST <staging-origin>/api/v1/webhooks/dhmad` (never the production hostname `nasj-platform.ddns.net`) is registered and subscribed to `escrow.status.updated`, `escrow.updated`, `escrow.cancellation.requested`, `escrow.cancellation.accepted`, `escrow.cancellation.rejected`, `escrow.delivery.rejected`, `escrow.funds.added`, `escrow.funds.refunded`, `contract.signed`, `dispute.*`, and `identity.verification.*`.
4. Seller signature is configured and `apiAutoSignEnabled` is enabled for B2B `autoSign: true` (or seller signs via `sign_contract` checkout session).

## 3. Incident, Inspection & Operational Runbooks

**Operator Inspection Endpoints**:
- Pending operations / obligation state: `GET /api/v1/payments/obligations/:id`, `GET /api/v1/payments/orders/:channel/:id/obligations`
- Webhook processing backlog & quarantined events: `GET /api/v1/payments/webhooks/inbox?status=QUARANTINED`
- Reconciliation runs & discrepancies: `GET /api/v1/payments/reconciliation/runs`, `GET /api/v1/payments/reconciliation/discrepancies`
- Subledger trial balance: `GET /api/v1/payments/ledger/trial-balance`
- Artisan payables & simulated payouts: `GET /api/v1/finance/orders/:id/records`, `GET /api/v1/payments/artisan/me`

**Incident Playbooks**:
- **Failed checkout**: Check `CheckoutSession` status and call `POST /api/v1/payments/checkout-sessions/:id/sync`. Never mark an order paid from a redirect URL alone.
- **Missing redirect configuration (`NO_REDIRECT_URLS_CONFIGURED`)**: Add the exact `<staging-origin>/orders` and `<staging-origin>/procurement` URLs under **Allowed Redirect URLs** in the DHMAD Developer Dashboard and retry session creation.
- **Incorrect recipient (`RECIPIENT_MISMATCH` / `RECIPIENT_NOT_CONFIGURED`)**: Obligation is quarantined (`DISCREPANCY_QUARANTINED`). Verify `DHMAD_EXPECTED_SELLER_EMAIL` matches `GET /v1/me` developer email and `escrow.sellerBusiness.contactEmail`; do not settle or pay out until resolved.
- **Provider timeout (`AMBIGUOUS_TIMEOUT`) / Ambiguous escrow creation (`AMBIGUOUS_QUARANTINED`)**: Do NOT blindly retry `POST /api/v1/escrows`. Run `POST /api/v1/payments/reconciliation/run` to scan `GET /api/v1/escrows` by `externalReference` (`nasj_<obligationId>`) and attach `externalEscrowId` if created.
- **Missing webhook**: Trigger `POST /api/v1/payments/reconciliation/run` to fetch authoritative state from DHMAD `GET /api/v1/escrows/:id` and post any missing balanced journal entries.
- **Invalid or forged webhook**: Rejected at `POST /api/v1/webhooks/dhmad` with `401` (HMAC-SHA256 mismatch or `X-Webhook-Timestamp` outside ±5 minutes). Inspect logs by `requestId`; secrets are redacted automatically.
- **Quarantined webhook event**: Inspect `GET /api/v1/payments/webhooks/inbox?status=QUARANTINED`, resolve root cause (e.g., missing escrow recovered via reconciliation), then replay via `POST /api/v1/payments/webhooks/inbox/:id/replay`.
- **Provider outage / 429 rate limits**: Reads and reconciliation stop cleanly on `429` (`X-RateLimit-Reset`) and `5xx`; core NASJ order, production, and logistics workflows continue unaffected.
- **Settlement mismatch / financial discrepancy**: Marked `DISCREPANCY_QUARANTINED` with a `ReconciliationDiscrepancy` row (`CRITICAL`/`HIGH`). Investigate against DHMAD dashboard before calling `POST /api/v1/payments/reconciliation/discrepancies/:id/resolve`.
- **Refund or dispute**: Disputes freeze obligation in `DISPUTED` and block payouts on affected batches. Respond via `POST /api/v1/payments/disputes/:id/reply`. Refunds post `DR REFUND_LIABILITY / CR ESCROW_HELD`; artisan payables are not erased silently and require authorized `FinancialAdjustment` review.
- **Failed payout simulation**: Review `PayoutRequest` and `ArtisanPayoutSimulation` status; never issue a second payout while an active/paid simulation exists.
- **Worker crash recovery**: `WebhookInboxEvent` rows use PostgreSQL `FOR UPDATE SKIP LOCKED` and lease expiry recovery (`leaseExpiresAt`). Restarting `apps/api/dist/jobs/main.js --watch` automatically resumes unprocessed/expired events.
- **Database backup & restore**: Standard `pg_dump` preserves all payment, webhook inbox, and ledger tables. After restoring into an isolated DB, run `POST /api/v1/payments/reconciliation/run` to sync external DHMAD sandbox state (never recreate already-created provider escrows).
- **Staging rollback**: Stop the staging API/worker, restore the pre-deploy `pg_dump` snapshot to the isolated staging DB, check out the previous qualified commit SHA, run `prisma migrate deploy` only if additive, restart staging API/worker, and run `reconciliation/run`.
- **Credential rotation**: Rotate `DHMAD_API_KEY` (`sk_sandbox_*`) and `DHMAD_WEBHOOK_SECRET` in secret management, restart API + worker, and verify `GET /api/v1/payments/provider/status`.
- **Security incidents**: Revoke compromised `sk_sandbox_*` keys in DHMAD dashboard immediately, rotate `DHMAD_WEBHOOK_SECRET` and `BETTER_AUTH_SECRET`, inspect `AuditEvent` and `WebhookInboxEvent` for anomalous `requestId`/`correlationId` entries, and keep `PAYMENTS_ENABLED=false` in production.

## 4. Pre-Live Commercial & Legal Gates

Before any future live-money activation mission:
1. Legal classification of NASJ as contractual seller vs intermediary under Tunisian law and DHMAD terms.
2. Accounting and tax treatment (TVA, stamp duty, withholding, processing-fee allocation policy).
3. Real-world KYC verification process (sandbox auto-approval does not verify real identity).
4. Separate production qualification and explicit approval to lift `PAYMENTS_ENABLED=false`.
