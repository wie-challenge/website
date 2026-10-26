# E01 demo personas

The demo identity boundary is implemented for the isolated `DEMO_MODE` deployment.

## Acceptance evidence

| Acceptance criterion | Implementation evidence |
|---|---|
| Clearly labeled synthetic roles | The login entry cards use a visible `DEMO` label and fictional `@demo.invalid` identifiers. |
| Six synthetic personas | The seed defines buyer, artisan, coordinator, production, QA, and finance personas. |
| Isolated scenario identity | Passwordless entry creates a session for the selected seeded demo user; switching roles creates another session only for a seeded demo identity. |
| Persistent labels and fictional details | The protected shell shows `DEMO MODE`, the selected role, email, and synthetic-data warning. |
| Server-side live-resource rejection | Commerce, procurement, and organization authorization paths reject demo actors targeting non-synthetic resources with HTTP 403 and `DEMO_LIVE_RESOURCE`. |

## Automated evidence

- `pnpm typecheck` — passed.
- `pnpm --filter @nasj/api exec tsx --test test/unit/demo-isolation.test.ts` — passed.
- `pnpm --filter @nasj/web test` — passed.
- `pnpm --filter @nasj/api exec prisma migrate status` — database schema up to date.

The full API unit command currently has three pre-existing Windows filesystem-permission failures in backup and local-operations tests; those tests do not exercise the demo changes.
