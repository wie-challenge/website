# Duplicates and obsolete files

**Date:** 1 November 2026.

## Exact duplicates

**57 redundant copies in 33 groups, 0.64 MB.** Content-hash comparison across the 827 files now under
`docs/`, excluding `preservation-backup/`, found 33 groups of byte-identical files. In each group the
highest-ranked copy is authoritative and the rest are redundant.

The previous revision of this document claimed **none**, across 1,525 artefacts. That count was
taken before the archive move completed and before the verification bundle was de-duplicated; it no
longer describes the tree.

| Group | Copies | What it is |
|---|---|---|
| `recovered-git/**` | 16 files | Recovery copies, 16 of 19 byte-identical to their `99-archive/` originals |
| `schema.log` | 11 | The same Prisma schema validation, captured once per batch |
| `diff.log` / `diff-check.log` | 15 | Empty or near-empty diff output, captured once per batch |
| Various logs and JSON exports | 15 | Batch-scoped repeats of one another |

These are retained. They are batch-scoped evidence whose value is that each batch captured it at
its own moment; deleting an 11th copy because its bytes match the 10th would remove the record that
that batch ran the check at all. The 0.64 MB they occupy is not worth that loss.

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

`documentation-maintenance/preservation-backup/` holds 54 files (2.6 MB) that duplicate restored
originals. It is **excluded from Git and from documentation navigation** because it exists solely as
recovery evidence for the incident in `EVIDENCE_RECOVERY_STATUS.md`. It is not a documentation
duplicate.

Both halves have since been restored to their live locations: `surviving-alignment-review/` is
byte-identical to `engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/`, and
16 of the 19 files in `tracked-evidence/` are byte-identical to their `99-archive/` originals. The
recovery this copy existed to enable is complete, so it is now removable. It was kept during this
pass because removing a recovery artefact immediately after the move it recovered from needs a
deliberate decision, not a cleanup default.

## Generated reports

644 of the 827 files under `docs/` are gitignored generated output (logs, JSON snapshots, browser
artefacts, Playwright traces). They are not documentation. Their retention is governed by the
`.gitignore` policy in `CONVENTIONS.md`.

Removed on 1 November 2026 as regenerable: four exponential GitHub snapshots (11.8 MB) from the
backlog-verification bundle, five byte-identical duplicate JSON exports, and one 12 MB Playwright
trace. `docs/` went from 59 MB to 29 MB across the pass. The 29 verdict reports in that bundle were
retained, and its `README.md` records what went and why.

## Current totals

| Measure | Value |
|---|---|
| Files under `docs/` | 827 |
| Markdown files | 226 |
| Markdown outside backup and recovery copies | 183 |
| Tracked files | 683 |
| Tracked payload | 9.6 MB |
| Working-tree size | 29 MB |
