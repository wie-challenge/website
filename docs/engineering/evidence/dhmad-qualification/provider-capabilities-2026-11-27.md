# DHMAD provider capability matrix — retrieved 2026-11-27

Documentation was retrieved on 2026-11-27 from the official DHMAD documentation index at
<https://docs.dhmad.tn/llms.txt>, its introduction at <https://docs.dhmad.tn/introduction>, and sandbox
guide at <https://docs.dhmad.tn/guides/sandbox.md>. The matrix distinguishes documentation claims
from authenticated provider evidence. No sandbox credentials or associated account were available.

| Capability | Official reference and documented endpoint | Auth, permissions, account types, schemas and errors | Lifecycle, idempotency, webhooks, sandbox/live differences | Verification / limitations |
|---|---|---|---|---|
| API authentication and sandbox isolation | [Introduction](https://docs.dhmad.tn/introduction); [Sandbox](https://docs.dhmad.tn/guides/sandbox.md). Sandbox API base is `https://sandbox.dhmad.tn/api/v1`; intro also describes Bearer or `X-API-Key`. Sandbox guide provides `GET /balance`. | Sandbox keys are documented with prefix `sk_sandbox_`; live keys `sk_live_`. Keys and data are environment-specific. A key requires an associated developer/user account. Endpoint-level permissions and exact auth error schema not yet verified. | Sandbox is described as a separate deployment/database and no-real-money environment. Intro reports 100 requests/minute/IP, configurable; detailed rate-limit/retry rules remain to inspect. | Documented only; no key, account association, or authenticated request. |
| Escrow creation / central recipient | [Create Escrow](https://docs.dhmad.tn/api-reference/escrows/create-escrow.md), [Escrows overview](https://docs.dhmad.tn/api-reference/escrows/overview.md); sandbox guide confirms `POST /api/v1/escrows`. | Exact request/response schema, role and permission model, seller/recipient identification, contract party requirements, processing fee and errors remain unverified. | One escrow per customer obligation is the NASJ design. Provider idempotency, external reference lookup and duplicate semantics remain unverified. | **Critical feasibility gate BLOCKED.** No official-source evidence yet proves NASJ can be the seller/recipient and settlement destination while the buyer funds the escrow. No authenticated verification. |
| Hosted checkout | [Checkout Sessions overview/create/get](https://docs.dhmad.tn/api-reference/checkout-sessions/create-session.md); [integration guide](https://docs.dhmad.tn/guides/checkout-sessions.md). Official index documents a Checkout Sessions API for redirect flow. | Exact methods, paths, schemas, account permissions, session ownership, error contract and expiry are not confirmed from page contents yet. | Webhook event coverage, session polling, duplicate-session handling, idempotency and return-URL validation remain unknown. Sandbox is documented as same API behavior with separate data. | Documentation index only; no authenticated sandbox flow. |
| Escrow state, lookup, cancellation, refund | [Get escrow](https://docs.dhmad.tn/api-reference/escrows/get-escrow.md), [cancel escrow](https://docs.dhmad.tn/api-reference/escrows/cancel-escrow.md), [Charges/refunds](https://docs.dhmad.tn/api-reference/charges/create-refund.md). Index lists endpoints, and sandbox guide confirms escrow create/list paths. | Escrow and charge response schemas, authorization scopes, error behavior, fee treatment and refund settlement effects remain unknown. | Pending cancellation is listed; refund documentation is for charges. Whether escrow refunds map to charge refunds, and funded escrow cancellation rules, remain unverified. | Partial documentation discovery; exact operation behavior is not verified. |
| Delivery confirmation and physical goods | [Completion policy](https://docs.dhmad.tn/guides/completion-policy.md), [deliver escrow](https://docs.dhmad.tn/api-reference/escrows/deliver-escrow.md), [quick escrow proof](https://docs.dhmad.tn/guides/quick-escrow-with-proof.md). The index describes a buyer protection/review window and seller delivery action. | Exact endpoint schema, actor permissions, delivery evidence requirements and provider errors remain unknown. | Need verify that physical receipt (not shipment) starts any review window; disputes suppress automatic release; NASJ is permitted to declare delivery; and the review period is suitable for manufactured goods. | Not verified for physical artisanal goods; no authenticated evidence. Do not trigger delivery at shipment. |
| Disputes | [Disputes API](https://docs.dhmad.tn/api-reference/disputes/overview.md) and sandbox guide. Sandbox guide documents a charge simulate endpoint for selected proof/dispute events, including dispute open, messages, and payer escalation. | Dispute scopes, exact response schemas, seller responses and escrow-specific dispute applicability remain unknown. Charge simulation only applies to charges per the sandbox guide. | Sandbox simulation documents specific state constraints and 409/404/400 errors. Chargebacks cannot be simulated. Escrow dispute lifecycle is unverified. | Some charge-dispute sandbox behavior is documented; escrow lifecycle not verified. |
| B2B / contracts | [Get contract](https://docs.dhmad.tn/api-reference/escrows/get-contract.md), [developer account association](https://docs.dhmad.tn/developer-portal/associating-accounts.md), [signature management](https://docs.dhmad.tn/developer-portal/signature-management.md). Index says escrow contract retrieval exists. | Legal entity eligibility, named representatives, signature authority, contract creation/signature workflows, permissions and exact schemas remain unverified. | Need verify contract acceptance precedes funding, party identities and amendment behavior. No one may sign for a buyer without proven authority. | Not authenticated; legal and entity eligibility gate remains open. |
| Pre-account KYC | [Identity verification create/get](https://docs.dhmad.tn/api-reference/identity-verifications/create-verification.md), [marketplace KYC guide](https://docs.dhmad.tn/guides/kyc-for-marketplaces.md). Introduction says pre-account KYC can verify sellers before DHMAD signup. | Exact personal fields, consent, data retention, account association, scopes, response and status schemas remain unknown. | Webhook events and sandbox auto-approval behavior remain to verify. No unnecessary DHMAD account creation should be assumed. | Capability advertised; implementation details and sandbox behavior not authenticated. |
| Webhooks / reliability | [Webhooks API](https://docs.dhmad.tn/api-reference/webhooks.md), [webhook guide](https://docs.dhmad.tn/guides/webhooks.md), [best practices](https://docs.dhmad.tn/guides/best-practices.md), [rate limits](https://docs.dhmad.tn/guides/rate-limits.md). | Signature format, key rotation, required permissions, event envelope and error codes not confirmed from page contents yet. | Event IDs, ordering, timestamps, retries, replay window, event retrieval, idempotency guarantees, merchant references and lookup recovery remain unverified. | Documentation index discovery only; authenticated delivery tests blocked. |
| Provider-to-NASJ settlement | [Balance API](https://docs.dhmad.tn/api-reference/ledger.md), escrow docs. Balance is documented as account information, not a payout API. | Settlement destination, supported account type, fee deductions, authorization, bank/transfer method, settlement reconciliation remain unknown. | Balance information does not prove a supported transfer or third-party payout mechanism. Live settlement explicitly out of scope. | Critical aspect of central-recipient feasibility unverified. |
| Artisan payouts | No confirmed standard payout endpoint found in the official documentation index. Progressive escrow release is documented but excluded from the approved business model. | No verified authorized mechanism for NASJ to pay artisans after receiving settlement. | Simulation and administrative recording only are acceptable for sandbox release. | Automated payout capability unverified; do not treat escrow release or balance as a third-party payout API. |

## Evidence boundary

The provider documentation index and sandbox overview establish that the API advertises escrows,
checkout sessions, KYC, webhooks, disputes, contracts and sandbox endpoints. Several linked API detail
pages could not be retrieved by the documentation browser in this session. No request was sent to a
provider endpoint. No account permissions, request schemas beyond the sandbox guide, successful
response, payment, or settlement have been authenticated. Provider-dependent implementation remains
blocked at the central-recipient gate until these facts are established.

## Detail pages retrieved subsequently

The detail pages were subsequently retrieved directly on 2026-11-27. These are documentation
claims, not authenticated sandbox observations:

- [Create escrow](https://docs.dhmad.tn/api-reference/escrows/create-escrow.md) documents
  `POST /api/v1/escrows`, required `title`, `amount`, and `buyerEmail`, and an optional
  `sellerEmail`. Omitting the seller email uses the developer's associated user account as seller.
  Standard mode supports a contract; quick mode has no contract. Seller auto-sign requires the
  associated seller and a configured signature. It must not be used to sign for the buyer.
- The same page says `feeBearer: seller` makes buyer funding equal the deal amount, with provider
  fees deducted from the seller's release; `feeBearer: buyer` adds fees to buyer funding. The
  returned `buyerFundingTnd` therefore needs to be matched against the approved obligation.
- [Checkout sessions](https://docs.dhmad.tn/api-reference/checkout-sessions/create-session.md)
  documents `POST /api/v1/escrows/:id/sessions`, `action`, `targetUserEmail`, and `redirectUrl`;
  allowed redirect URLs must be configured in the provider dashboard. The response includes
  `sessionId`, `url`, and `expiresAt`; documented expiry is 30 minutes.
- [Delivery confirmation](https://docs.dhmad.tn/guides/completion-policy.md) says the seller's
  delivery action starts the frozen review window, silence can release funds, and a dispute opened
  before the deadline pauses automatic completion. Whether NASJ can reliably establish physical
  receipt before declaring delivery and whether the policy is suitable remain qualification gates.
- [Marketplace KYC](https://docs.dhmad.tn/guides/kyc-for-marketplaces.md) documents
  `POST /api/v1/identity-verifications`, `email`, and optional `external_user_id`; sandbox
  verification is described as immediately approved without an email, with a sandbox status source.
  This is not real identity verification.
- [Webhooks guide](https://docs.dhmad.tn/guides/webhooks.md) documents `X-Webhook-Signature` as
  hex HMAC-SHA256 over the JSON payload (`JSON.stringify(payload)`), verified in constant time,
  with `X-Webhook-Timestamp` (reject events older than 5 minutes), `X-Webhook-Id` (UUID for
  deduplication), and `X-Webhook-Event` headers. Up to 2 webhook endpoints are allowed per
  developer account.
- [Completion policy](https://docs.dhmad.tn/guides/completion-policy.md) documents
  `completionPolicy: { type: "delivery_confirmation", buyerReviewDeadlineHours }` (bounds 24–336h;
  cannot combine with `completionDeadlineDays` or `progressiveRelease`). It blocks early buyer
  release from `paid` (`DELIVERY_REQUIRED`) until the seller calls `POST /api/v1/escrows/:id/deliver`.
- [Cancel escrow](https://docs.dhmad.tn/api-reference/escrows/cancel-escrow.md) documents that
  `POST /api/v1/escrows/:id/cancel` applies only to `pending` escrows; paid/delivered escrows use
  `request_cancellation` (buyer) or `cancel_escrow` (seller) checkout sessions.
- [Disputes API](https://docs.dhmad.tn/api-reference/disputes/overview.md) requires `disputes:read`
  / `disputes:write` API key permissions and supports `Idempotency-Key` on `POST /v1/disputes/:id/messages`.
- Note: `POST /api/v1/escrows` does not document a `merchantReference` field or `Idempotency-Key`
  header (unlike charges/dispute messages), so NASJ embeds `nasj_<obligationId>` in `title` and
  persists a `ProviderOperation` pre-commit record to resolve ambiguous timeouts via `GET /api/v1/escrows`.

The documentation supports an associated-account seller model in principle. NASJ's account
association, permission, contractual role, funding, settlement destination and actual behavior are
still unverified (`BLOCKED_CREDENTIALS`); the critical authenticated feasibility gate remains blocked.
