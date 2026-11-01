# Duplicates and obsolete files

**Date:** 1 November 2026.

## Exact duplicates

**None.** Content-hash comparison across all 1,525 discovered artefacts found no two files with
identical bytes outside the preservation backup.

## Near-duplicates examined

| Pair | Overlap | Verdict |
|---|---|---|
| `batch12-acceptance-matrix` / `audits/batch12/acceptance-matrix` / `batch12-remediation/updated-acceptance-matrix` | 56–67% vocabulary | **Not duplicates.** Implementation view, independent-audit view and post-remediation view. Each is dated and cited separately. Retained. |
| `backlog-closeout/full-backlog-status-audit` / `role-story-access-matrix` | 56% vocabulary | **Not duplicates.** Backlog state versus role responsibilities. Retained. |

Similarity was measured by shared-word-set Jaccard index over 5+ character words, with a 50%
threshold. Filename similarity was not used, per the task rule.

## Obsolete files retained deliberately

| Category | Count | Why retained |
|---|---|---|
| Historical batch reports | 113 | Each is the only record of what that batch changed. Merging them would destroy the audit trail. |
| Batch planning documents | 6 | Superseded by their implementation reports, but they record the intended scope at the time. |
| E16/E02 epic records | 13 | Cited by later batch reports. |

## The preservation backup

`documentation-maintenance/preservation-backup/` holds 54 files that duplicate restored originals.
It is **excluded from Git and from documentation navigation** because it exists solely as recovery
evidence for the incident in `EVIDENCE_RECOVERY_STATUS.md`. It is not a documentation duplicate.

## Generated reports

1,101 of the 1,525 artefacts are gitignored generated output (logs, JSON snapshots, browser
artefacts). They are not documentation. Their retention is governed by the `.gitignore` policy in
`CONVENTIONS.md`.
