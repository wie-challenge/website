# Documentation map

**Last verified:** 1 November 2026.

## Structure

```text
docs/
├── README.md                      Portal
├── 00-project/                    Overview, status, scope, terminology, repository map
├── 01-product/                    Feature and workspace documentation
├── 02-architecture/               System, data, authorization, transactions, API
├── 03-engineering/                Setup, migrations, testing
├── 04-ai/                         AI service (planned section)
├── 05-iot/                        Wearable (planned section)
├── 06-security-and-governance/    Security, privacy, financial controls
├── 07-operations/                 Deployment, monitoring, jobs, runbooks
├── 08-backlog-and-acceptance/     Backlog, gaps, owner decisions
├── 09-verification-and-quality/   Testing, concurrency, coverage
├── 10-research-and-pilots/        Pilot and competition material
├── 99-archive/                    All historical evidence, indexed
├── competition/                   Frozen submission artefacts (hash-pinned)
├── engineering/                   Surviving raw evidence only
└── documentation-maintenance/     This maintenance record
```

## Authoritative entry points

| Question | Document |
|---|---|
| What is this project? | [Project overview](../00-project/overview.md) |
| What works today? | [Current status](../00-project/current-status.md) |
| What is deliberately missing? | [Scope and boundaries](../00-project/scope-and-boundaries.md) |
| What still blocks release? | [Known gaps](../08-backlog-and-acceptance/known-gaps.md) |
| How is it built? | [System overview](../02-architecture/system-overview.md) |
| How do I run it? | [Local development](../03-engineering/local-development.md) |
| How do I test it? | [Testing guide](../09-verification-and-quality/testing-guide.md) |
| What went wrong with evidence? | [Evidence recovery status](EVIDENCE_RECOVERY_STATUS.md) |

## Deliberate deviations from the proposed tree

| Proposed | Actual | Reason |
|---|---|---|
| `04-ai/` with nine documents | `05-iot/wearable-overview.md` only | The AI service is not integrated and has no trained model. Nine documents would describe capabilities that do not exist. |
| `10-research-and-pilots/` | `competition/` retained | The competition package is a frozen deliverable with a hash-pinned review record. Restructuring it would break `pnpm competition:validate`. |
| `99-archive/` empty of evidence | Evidence stays under `docs/engineering/evidence/` | Those paths are referenced by surviving historical reports and are gitignored binaries. Moving them would break references for no gain. |
| Numbered folders everywhere | `competition/`, `engineering/`, `documentation-maintenance/` unnumbered | These are retained as-is to preserve working references and the submission validator. |
