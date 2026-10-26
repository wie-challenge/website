# US-015 artisan groups evidence

## Scope and evidence boundary

All records shown by this feature are explicitly synthetic fictional fixtures for local
simulation and planning. They are not observed evidence, hardware measurements, wearable
data, real contracts, or money movement. No real contract or payment is authorized.
The response contains no contact details, home addresses, exact locations, emails, phones,
or wearable/health fields.

## Acceptance mapping

| Criterion | Implementation | Evidence |
| --- | --- | --- |
| Fictional provenance and visible attributes | `DEMO —` profile/craft names, `SYNTHETIC` response, UI badges; craft and governorate-level region | `GET /api/v1/commerce/artisan-groups`, protected page |
| Periods and PIECES quantities | Existing `CapacityDeclaration` rows, filtered to `PIECES`, period and quantity projection | Seed fixture and API contract |
| Reconciled quantities | Accepted `CommercialOffer` quantities are summed as committed; remaining is server-computed and clamped to zero | Commerce offer status is the existing reservation source of truth |
| Privacy | Safe response projection selects no user/profile IDs or contact fields | API response type and serialization tests |
| Filtering and empty states | Strict craft, area and period query schema; loading, retry, no-match and no-capacity messages | Protected UI and API validation tests |
| Authorization and audit | Active verified session plus approved INTERNAL membership with `PRODUCTION_MANAGER`; read is audited | `iamTransaction` and commerce audit event |

## Commands and results

Commands run for this change:

- `pnpm --filter @nasj/contracts build` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed.
- Changed-file Biome lint — passed.
- `pnpm lint` — failed before completion: Biome reports a Windows `scripts/*.ts`
  wildcard path error, and initially reported formatting/a11y issues in the new UI;
  the changed files were then formatted and linted successfully.
- `pnpm test` — 41 passed, 3 failed in pre-existing backup/operations tests that
  require Unix private-file/directory ownership semantics on Windows. No US-015
  test failed or was reached by that unrelated failure.

No state-changing git command was run. No migration was needed.

## Known limitations

The local seed includes a no-capacity group and declared periods, while committed
quantities are derived only from accepted commercial offers already present in the
commerce ledger. Declined and expired offers are therefore released by the existing
status rules rather than copied into a second registry. This feature does not claim
calendar optimization or physical capacity verification.
