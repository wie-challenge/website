# API boundaries and capacity replay contract

NestJS is authoritative. Next rewrites `/api/*` to its configured internal origin. `PUBLIC_APP_URL` must match the browser Origin exactly. Better Auth cookies are HttpOnly; account status, session expiry and privileged MFA are checked server-side. Unsafe methods require approved Origin and JSON; application mutations additionally require `X-CSRF-Token` from `GET /api/v1/me`. Never log that response/token. Same-origin cookies remain browser-managed.

Routes are defined in `apps/api/src/modules/{auth,users,organizations,artisans,governance,commerce}/*.controller.ts` and the auth gateway allowlist. Shared strict schemas in `packages/contracts/src` are the executable request contracts; response projection types avoid exposing credentials. There is no upload or wearable endpoint; the isolated synthetic commerce routes are listed below. No generated OpenAPI is configured; do not describe these TypeScript contracts as OpenAPI.

| Area | Representative routes | Scope |
|---|---|---|
| Health | GET `/api/health/live`, `/api/health/ready` | Public; ready checks PostgreSQL |
| Session | GET/PATCH `/api/v1/me`, GET/DELETE `/api/v1/me/sessions[/:id]` | Own verified account |
| Organizations | `/api/v1/organizations`, `/:id`, `/:id/members`, `/:id/invitations` | Membership and operation permission |
| Administration | `/api/v1/admin/organizations`, approvals, users, audit | Platform policies and MFA; no implicit artisan access |
| Artisan | `/api/v1/artisans/me`, `/skills`, `/capacity`, `/associations`, `/delegations` | Owner |
| Assistance | `/api/v1/artisans/:id`, `/:id/skills`, `/:id/capacity` | Owner or current explicit consent/delegation scope |
| Governance | Privacy requests, support cases, consents and audit controllers | Own subject or explicitly scoped staff policies |

Consult controller decorators for exact methods and nested route suffixes. Each identifier passes `resourceIdSchema`; request/list schemas cap input sizes and reject unknown fields. Body limit is 32 KiB. Rate limits are enforced in Nest on direct and rewritten requests.

`POST /api/v1/artisans/me/capacity` and `POST /api/v1/artisans/:id/capacity` accept an optional `Idempotency-Key` of 16..128 ASCII letters/digits/underscore/hyphen. Existing clients without keys retain revision behavior. The browser uses UUID keys and retains one for the same payload during a failed request while the form stays mounted. Navigating/reloading loses that pending browser key; persist/reuse it in an API caller if recovery must survive reload.

A successful first call and authorized identical replay both return 201 and the same original JSON capacity projection (including original `supersededAt`). A changed parsed payload with the same scoped key returns 409 `IDEMPOTENCY_CONFLICT`; malformed key returns 400. Key reuse by a different actor/profile has a distinct scope and grants no access. Replay still rejects revoked consent, missing skill, invalid session or delegation. Outcomes are not automatically expired. The key is not stored or logged in plaintext.

Capacity input: `craftSkillId`, `unitType` HOURS/PIECES, numeric `quantity` at most two decimal places 0..100000, ISO `effectiveFrom` and `effectiveTo`. Quantity responses are decimal strings. No quantity is inferred from wearable data.

Errors contain `code`, safe `message`, optional field issues and `requestId`; the response header `X-Request-ID` matches. 401 means invalid session, 403 denied permission/origin/CSRF, 400 invalid input, 409 conflicting state/key, 429 rate limited (`Retry-After`), 503 dependency unavailable. Errors never return exception text or upstream credentials.

## Synthetic commerce contracts

All routes below are relative to `/api/v1/commerce`, require the independent Nest session/CSRF/origin boundary, and reject unknown input fields. Every POST/PATCH requires `Idempotency-Key`; missing/invalid keys return 400. Successful POSTs return 201; draft PATCH returns 200. The command result is `{id,version}`; reload `GET /workspace` for the current safe projection. Resource role checks happen before replay, and stale `version` returns 409. Lists are bounded to 100 records each; no arbitrary client tenant filter is accepted.

| Method / route | Contract | Authorized operation |
|---|---|---|
| GET `/workspace` | `CommerceWorkspaceView` | Current buyer/internal memberships and own artisan profile; safe role-scoped lists |
| POST `/rfqs` | `rfqCreateSchema` | Approved BUYER creates synthetic draft, selecting an approved internal operator and active craft |
| PATCH `/rfqs/:id` | `rfqEditSchema` | Buyer edits DRAFT only; immutable owner/operator/provenance |
| POST `/rfqs/:id/actions` | `rfqActionSchema` | Buyer submit/accept/decline; production review; finance quote/expire |
| POST `/offers` | `offerCreateSchema` | Assigned production manager reserves selected declared capacity and issues immutable terms |
| POST `/offers/:id/actions` | `offerActionSchema` | Owner artisan accept/decline; production expire after deadline |
| POST `/batches/:id/actions` | `batchActionSchema` | Owner production/submission/rework decisions, assigned production/QA actions by role |
| POST `/batches/:id/progress` | `progressSchema` | Owner reports cumulative `produced`, never a delta |
| POST `/batches/:id/inspections` | `inspectionSchema` | Assigned QA records reconciled approved/rejected/pending snapshot and defect reason |
| POST `/orders/:id/actions` | `orderActionSchema` | Current role for funding, release, QA, logistics, buyer receipt, finance reconciliation/closure |
| POST `/payments` | `paymentCreateSchema` | Assigned finance schedules `BUYER_RECEIPT` or `ARTISAN_PAYOUT`; payout batch must belong to order |
| POST `/payments/:id/actions` | `paymentActionSchema` | Assigned finance progresses an isolated synthetic payment; settled requires `SIMULATED_SETTLEMENT` |

All exact fields/types are in `packages/contracts/src/commerce/contracts.ts`; state/role edges and money/quantity semantics are documented in [commerce architecture](../architecture/commerce.md). Dates are ISO timestamps, amounts are TND strings, quantities are whole pieces, all commercial `provenance` inputs must be `SYNTHETIC`. A positive quote has a future expiry before delivery. Offer terms include quantity, unit/total pay, effort range, expiry/deadline, specification, materials, rework and payment conditions before voluntary acceptance.

Buyer projections contain their own RFQs/orders/receipts and omit artisan offers/batches/payouts. Artisans receive their own terms, production and payouts without buyer quote/receipts or other artisans. QA cannot read individual money columns/payment records; production/finance see offer pay as required to create/reconcile terms. Draft RFQs remain private until submission. Platform ADMIN or organization-manager status alone grants no operational role. Individual wearable fields have no contract or persistence column and are rejected by strict schemas.
