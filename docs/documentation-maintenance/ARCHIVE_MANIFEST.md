# Archive manifest

**Date:** 1 November 2026.

Materials moved into `docs/99-archive/`. Every file retains its original content.

## historical-audits/

Batch implementation reports, acceptance matrices and dated domain reports for batches 5–14 and the
E16/E02 epics. Moved from `docs/engineering/`. Reason: superseded as current documentation by
`00-project/current-status.md`, but retained as the record of what each batch did.

## remediation-batches/

Audit and remediation material: `audits/`, `batch12-remediation/`, `batch13-planning/`,
`batch14-planning/`, `batch8-11-completion/`. Reason: batch-scoped evidence.

## historical-backlog-snapshots/

`backlog-closeout/`, `full-backlog-audit/`, `full-backlog-remediation/`. Reason: GitHub backlog
reconciliation and audit passes, tied to a snapshot date.

## legacy-documentation/

`delivery-report`, `role-restructuring-audit`, `role-story-access-matrix`, `try-the-foundation`, moved
from `docs/foundation/`. Reason: foundation-era documents describing a completed extraction.

## superseded-plans/

Reserved. Batch planning documents currently sit under `remediation-batches/` with the audits that
superseded them.

## What was NOT archived

| Retained in place | Reason |
|---|---|
| `docs/competition/` | Frozen submission artefacts. Content hash pinned in `artifact-validation.json`; moving or editing breaks `pnpm competition:validate`. |
| `docs/engineering/evidence/` | Surviving raw evidence, referenced by archive reports. Binary artefacts remain gitignored. |
| `docs/engineering/remediation-batch2/` | Active proposal awaiting owner decisions D1 and D2. |

## Verification

All 380 tracked historical files were compared against `git show HEAD:<path>` after restructuring:

- 368 byte-identical
- 12 differ only by CRLF→LF normalization applied by `.gitattributes` (`* text=auto eol=lf`)
- **0 genuinely modified**

See `HASH_VERIFICATION.json`.
