from pathlib import Path
import json,re,collections,hashlib,subprocess,datetime
out=Path(__file__).resolve().parent.parent;ev=out/'evidence';root=out.parents[3]
criteria=json.loads((ev/'criteria-original.json').read_text())
live=json.loads((ev/'issues-live.json').read_text())
status={'E18-01':'VERIFIED_SOFTWARE_CRITERIA','E18-02':'VERIFIED_SOFTWARE_CRITERIA','E18-03':'FAILED_VERIFICATION','E10-11':'PARTIALLY_IMPLEMENTED','E10-13':'PARTIALLY_IMPLEMENTED','E10-14':'FAILED_VERIFICATION','E16-08':'VERIFIED_SOFTWARE_CRITERIA','E14-09':'BLOCKED_EXTERNAL_REVIEW'}
implementation={
'E18-01':'SalesService.scope/workspace/create/update (sales.service.ts:16–264); batch12.ts prospect schemas; CommercialProspect/ProspectRevision; sales-workspace.tsx.',
'E18-02':'SalesService.propose (sales.service.ts:266–423); PilotProposalRevision; existing ProcurementService.accept; sales-workspace.tsx ProposalForm.',
'E18-03':'FinanceService.analysis/recordCost/reviewCashModel/reviewRfq; finance/analysis.ts cashGap/signedTnd; ProcurementService.accept:1095; financial-analysis.tsx.',
'E10-11':'FinanceService.exportAccounting:854; finance/analysis.ts accountingExport/csvCell; finance.accounting.export permission; existing payables/deposits/payout sources.',
'E10-13':'FinanceService.timeliness:975–1017; finance/analysis.ts paymentTimeliness; execution_unverified native CHECK (20261027080000_financial_controls:107); payable writers logistics.ts:1022 and sample-obligations.ts:35.',
'E10-14':'FinanceService.assess/snapshot/closeOrder; CommerceService.orderAction:829–840; existing OrderClosureAssessment triggers and financial/inventory authorities.',
'E16-08':'operations/backup.ts/check.ts; common/logging.ts; foundation/transaction.ts; health.controller.ts; jobs/alerts.ts; docs/operations/README.md.',
'E14-09':'governance/retention.ts and retention.controller.ts; admin/retention/page.tsx; existing governance privacy-request and trace revocation paths.',
}
tests={
'E18-01':'Independent CONTACT_SCOPE and native-batch12.json; independent-browser final opt-out/history/unauthorized views; full batch12.scenarios.ts discovery/revocation/version checks.',
'E18-02':'Full batch12.scenarios.ts proposal revision/WON no-obligations checks; tests/e2e/batch12.spec.ts DRAFT→SENT→LOST and RFQ-backed WON; native append-only behavior.',
'E18-03':'Independent FUNDING_BEFORE_WON (+ funding-hold follow-up), CSV_RECONCILIATION; pure-finance.json negative sign/late cash; independent browser cash review; full batch12 scenarios.',
'E10-11':'Independent PostgreSQL SUM vs independently parsed CSV (12,346 millimes); actual browser file download; pure CSV injection checks; full finance.scenarios.ts liability reconciliation and tenant denial.',
'E10-13':'Independent TIMELINESS_REACHABILITY + eleven-case TIMELINESS_PURE; native constraint inventory; full HTTP unknown/zero-denominator check and browser display. Pure verified rows are not schema-valid settlement evidence.',
'E10-14':'Independent LEGACY_ADJUSTMENT_CLOSE reproduces HTTP 201 CLOSED against pending adjustment; full managed-close denial/replay, partial payout/dispute/material cases; product-authority linked sample check.',
'E16-08':'Independent encrypted CLI backup/decrypt/restore, 130 per-table row hashes and native constraints; independent populated 127→130 upgrade; full native checks/restore; backup-logging/operations unit tests.',
'E14-09':'Independent RETENTION_NO_PURGE + mobile/desktop operational review and access denial; inventory unit checks; full privacy/public-trace revocation tests.',
}
missing={
'E18-01':'None identified within the software-specific original criteria; contact hiding is not physical erasure. Buyer verification remains independent.',
'E18-02':'None identified for authorized RFQ conversion; signed-contract verification and actual buyer outcomes are not asserted. Won alone creates no agreement.',
'E18-03':'A12-02: the required pre-commitment review is bypassable before WON; supported actual revenue/cost contribution also remains unavailable under unapproved recognition definitions and incomplete evidence.',
'E10-11':'Original invoice-subledger reconciliation has no approved invoice source/policy. Existing cost/liability/receipt/request/execution groups reconcile; quote references are not invoices or recognized revenue.',
'E10-13':'A12-03: supported contractual-date and verified-settlement integration is incomplete; the native schema forbids every positive verified execution row, and pending/failed detail is collapsed into unknown. Pure math passes but cannot verify the end-to-end story.',
'E10-14':'A12-01: legacy close bypasses the authoritative blockers for FinancialAdjustment. Positive closure/lawful exception handling also remain policy-dependent and disabled.',
'E16-08':'No missing local software criterion identified. The measured drill does not certify hosted/off-site recovery, real paging or production-scale RTO/RPO.',
'E14-09':'Qualified retention-duration/preservation review, named controller/incident assignments and reviewed removal procedures remain pending. Purpose/trigger/access placeholders and no-purge controls are implemented.',
}
gates={
'E18-01':'Real contact consent/lawful-basis evidence and owner review; no verified buyer or purchase implied.',
'E18-02':'Real buyer responses, signed agreements and commercial outcomes require external evidence.',
'E18-03':'Approved recognition/funding policy and complete attributable actual evidence; independent software bypass requires a fix.',
'E10-11':'Approved invoice/tax policy and invoice source, without fabricated jurisdictional mappings.',
'E10-13':'Approved settlement-verification policy/provider and immutable contractual-date workflow; do not relax anti-fabrication constraints.',
'E10-14':'Approved lawful disposition/settlement/exception policy after bypass remediation; no administrative debt waiver.',
'E16-08':'Named production on-call/key custody/off-site storage and deployment recovery validation; local reviewed targets only.',
'E14-09':'Qualified legal-policy review and named operational/privacy/security ownership; no compliance certification or destructive purge authorization.',
}
criterion_states={
'E18-01':['PASS_SOFTWARE']*5,'E18-02':['PASS_SOFTWARE']*5,
'E18-03':['PARTIAL','PARTIAL','PASS_SOFTWARE_ESTIMATE_ONLY','PASS_SOFTWARE_ESTIMATE_ONLY','FAILED_A12_02'],
'E10-11':['PASS_SOFTWARE_EXISTING_SOURCES','PASS_SOFTWARE','PARTIAL_INVOICE_SOURCE_ABSENT','PASS_SOFTWARE','PASS_SOFTWARE'],
'E10-13':['PARTIAL','PARTIAL_CONTRACT_DATE_PATH','PARTIAL_VERIFIED_ADAPTER_UNREACHABLE','PARTIAL','PASS_SOFTWARE_EXCLUSIONS'],
'E10-14':['FAILED_A12_01','FAILED_A12_01','FAILED_A12_01','BLOCKED_EXTERNAL_REVIEW','PARTIAL_NEW_GATE_ONLY'],
'E16-08':['PASS_SOFTWARE_LOCAL_SCOPE']*5,
'E14-09':['BLOCKED_EXTERNAL_REVIEW','PARTIAL_DURATION_PENDING','BLOCKED_EXTERNAL_REVIEW','BLOCKED_EXTERNAL_REVIEW','PARTIAL_EXPIRY_NOT_ERASURE','PASS_SOFTWARE'],
}
for r in criteria:
 r['criterionStatus']=criterion_states[r['story']][int(r['id'].split('.C')[1])-1]
 r['implementationEvidence']=implementation[r['story']];r['testEvidence']=tests[r['story']];r['missingOrExternal']=missing[r['story']]
(ev/'criterion-evidence.json').write_text(json.dumps(criteria,indent=2)+'\n')
commands=json.loads((ev/'commands.json').read_text());byname={r['name']:r for r in commands}
assert len(commands)==10 and all(r['exitCode']==0 for r in commands),commands
read=lambda name:(ev/name).read_text()
def testcount(name,pattern):return int(re.search(pattern,read(name))[1])
counts={'apiUnit':testcount('api-unit.log',r'ℹ pass (\d+)'),'webUnit':testcount('web-unit.log',r'ℹ pass (\d+)'),'integration':testcount('integration.log',r'Integration passed: (\d+)'),'applicationBrowser':testcount('browser.log',r'\b(\d+) passed'),'showroomWithinBrowser':int(re.findall(r'\b(\d+) passed',read('browser.log'))[-1]),'separateShowroom':testcount('showroom.log',r'\b(\d+) passed'),'independentBrowser':testcount('browser-independent-final.log',r'\b(\d+) passed'),'targetedHarnessIncludingBootstrap':testcount('targeted-final.log',r'Integration passed: (\d+)')}
assert counts=={'apiUnit':131,'webUnit':25,'integration':166,'applicationBrowser':52,'showroomWithinBrowser':3,'separateShowroom':3,'independentBrowser':2,'targetedHarnessIncludingBootstrap':21},counts
integration_json=[json.loads(l) for l in read('integration.log').splitlines() if l.startswith('{"evidence":')]
native=next(x for x in integration_json if x['evidence']=='DISPOSABLE_NATIVE_POSTGRESQL_MIGRATIONS')
restore=next(x for x in integration_json if x['evidence']=='DISPOSABLE_ENCRYPTED_SYNTHETIC_RESTORE')
independent=json.loads(read('independent-results.json'));independent_restore=next(x for x in independent if x['id']=='RESTORE_INDEPENDENT')
baseline=json.loads(read('baseline.json'))
changed=[p for p,v in baseline['files'].items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=v['sha256']]
assert not changed,changed
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
(ev/'workspace-preservation.json').write_text(json.dumps({'checkedAt':now,'baselineHead':baseline['head'],'baselineBranch':baseline['branch'],'filesCompared':len(baseline['files']),'changedOriginalFiles':changed,'indexDiff':subprocess.check_output(['git','diff','--cached','--stat'],cwd=root).decode(),'note':'All additions belong under docs/engineering/audits/batch12/. Generated ignored build/test outputs are excluded.'},indent=2)+'\n')
summary={'verifiedAt':now,'statuses':dict(collections.Counter(status.values())),'ownerAcceptance':'PENDING_ALL_EIGHT','tests':counts,'commandManifest':'commands.json','nativeMigration':native,'fullRestore':restore,'independentRestore':{k:v for k,v in independent_restore.items() if k!='snapshots'},'preBatch12Upgrade':json.loads(read('native-batch12.json')),'findings':{'P0':0,'P1':3,'P2':0},'originalFilesModified':len(changed),'productFixesApplied':False,'persistentDatabaseTouched':False}
(ev/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
def cell(v):return str(v).replace('|','\\|').replace('\n','<br>')
lines=['# Batch 12 independent acceptance matrix','','28 October 2026 · Africa/Tunis. Exactly eight stories and 41 criteria, compared verbatim with historical and authenticated live GitHub bodies. All owner acceptance remains PENDING. [Per-criterion evidence](evidence/criterion-evidence.json).','',
'| Story | GitHub Issue | Original Criteria | Implementation Evidence | Test Evidence | Missing Criteria | Software Status | External Gate | Owner Acceptance |',
'|---|---|---|---|---|---|---|---|---|']
for sid in status:
 items=[r for r in criteria if r['story']==sid];issue=items[0]['issue'];orig='<br>'.join(r['id']+': '+r['text'] for r in items)
 lines.append('| '+' | '.join(cell(v) for v in [sid,f"[#{issue.split('/')[-1]}]({issue})",orig,implementation[sid],tests[sid],missing[sid],status[sid],gates[sid],'PENDING'])+' |')
lines+=['','The original 4 verified / 3 partial / 1 blocked distribution is **not supported**. Independent result: **3 VERIFIED_SOFTWARE_CRITERIA, 2 PARTIALLY_IMPLEMENTED, 2 FAILED_VERIFICATION and 1 BLOCKED_EXTERNAL_REVIEW**.','',
'Changed classifications: E18-03 PARTIAL → FAILED because the financial commitment gate is bypassable (A12-02); E10-14 PARTIAL → FAILED because an order can be closed despite unresolved adjustment blockers (A12-01); E10-13 VERIFIED → PARTIAL because only the safe unknown path is integrated and verified-positive settlement is schema-unreachable (A12-03). E14-09 maps the earlier generic BLOCKED label to the precise external-review status. Other classifications are retained.','',
'Implementation paths refer to `apps/api/src/modules/` and `apps/web/src/`; test names refer to their existing `apps/api/test/` and `tests/e2e/` files or this audit’s evidence directory. The [report](VERIFICATION_REPORT.md) and [findings](FINDINGS.md) identify concrete execution boundaries. Software PASS does not mean legal approval, verified external payment or real commercial success.']
(out/'ACCEPTANCE_MATRIX.md').write_text('\n'.join(lines)+'\n')
assert len(re.findall(r'^\| E\d{2}-\d{2}',(out/'ACCEPTANCE_MATRIX.md').read_text(),re.M))==8
report=f'''# Batch 12 independent verification

28 October 2026 · Africa/Tunis. **Acceptance verdict: do not accept Batch 12 as complete.** The reported 4/3/1 story split changes to **3 verified, 2 partial, 2 failed verification, 1 blocked external review**. All eight owner acceptances remain PENDING. Three reproduced P1 findings are recorded in [FINDINGS.md](FINDINGS.md); no P0 or liability erasure was reproduced. No product fix was applied.

## Scope, provenance and preserved state

Repository `website/`; HEAD `{baseline['head']}`; branch `{baseline['branch']}`. The baseline contained 127 modified/untracked status entries spanning earlier batches and Batch 12. [Baseline](evidence/baseline.json) records the exact status and hashes. After verification, **all {len(baseline['files'])} original files have unchanged contents**, including previous implementation reports and untracked code. The index remains empty. Only this audit directory was added. No commits, branch switching, deployment, GitHub mutation, persistent database operation or persistent showroom reset occurred. Ignored build/test outputs were regenerated by the existing runners. The browser build also rewrote Next’s generated `next-env.d.ts` dist-directory imports; after testing, only those generated bytes were restored to their SHA-256-verified original baseline, with no user edit overwritten.

The eight historical issue mappings are correct: #204/#205/#206, #146/#148/#73, #77 and #74. Authenticated read-only `gh issue view` retrieval matched every original issue body exactly. All **41 original criteria** match the earlier matrix with no duplicates/omissions. At retrieval #73 and #77 were CLOSED; the other six were OPEN. Those states are not owner acceptance. [Live source](evidence/issues-live.json), [criterion evidence](evidence/criterion-evidence.json).

Node 24.20.0, pnpm 11.3.0, Docker 29.9.2, native PostgreSQL 17.7 Alpine; headless Chromium through the existing Playwright harness. Disposable database identities are verified by `nasj-test-<16 hex>` container naming, random credentials/loopback ports and finally cleanup. Test mail stays in local capture. No production backup or volume was accessed, and no credential-file contents were displayed or stored in audit evidence. Existing CLI configuration loaders may read local `.env`; disposable datasource URLs override those configuration targets.

## Evidence reconciliation and execution

Historical logs contain the claimed 131/25/166/52/3 totals and the 29/2 focused results. Their logs have file timestamps but no complete timestamped command/exit/source-hash manifest. The last full integration log and focused API log precede later sales/procurement/test-file writes; mtime alone cannot establish whether those changes were semantic. The later browser log covers the last won-proposal change. Therefore prior summaries were corroborating evidence, not an independent final-state proof.

This audit first ran independent high-risk HTTP/SQL/browser checks, then **one complete regression cycle**. Every command in [commands.json](evidence/commands.json) records arguments, cwd, start/end UTC, exit code and log. All ten commands exited **0**:

- `pnpm lint`: 410 files; no findings.
- `pnpm typecheck`: contracts, API, integration/test configuration and web pass.
- API unit tests: **{counts['apiUnit']} passed**, 0 failed/skipped. Web: **{counts['webUnit']} passed**, 0 failed/skipped.
- `pnpm test:integration`: **{counts['integration']} scenarios passed**; real HTTP, native transactions, isolation, migration and restore checks.
- `pnpm test:e2e`: **{counts['applicationBrowser']} application tests + {counts['showroomWithinBrowser']} showroom tests passed**. Separate `pnpm test:e2e:demo`: **{counts['separateShowroom']} passed**.
- Production build, Prisma validation from `apps/api` and `git diff --check`: pass.

Additional independent checks: **21 targeted harness checks** (13 existing bootstrap checks plus eight audit probes), **4 pure finance edge checks**, **2 mobile/desktop acceptance journeys**, and a populated native pre-Batch12 upgrade check. A separate 15-check focused run (13 repeated bootstrap checks plus two probes) confirmed acceptance despite an explicit HOLD / UNFUNDED decision; it is not counted as 15 additional unique product scenarios. Counterexample probes intentionally assert the observed incorrect 201 response: their execution PASS means the defect was reproduced, not that the product met the denial requirement. Early audit-only failures came from a relative inherited tsconfig, a numeric-string parser, an incomplete synthetic fixture and selector/reload assumptions. Only final successful audit runs are used. PostgreSQL normalized one equivalent AND grouping on restore; this is disclosed below rather than mistaken for a constraint loss.

## Financial integrity and security

**Funding-review failure:** a sent proposal accepts an RFQ reference but retains it only in JSON; its relational RFQ link appears only on WON. `ProcurementService.accept` conditions finance review on that relational link. Independent HTTP accepted the exact quote with no finance-review event. This violates the required ordering before commitment. A buyer-authorized application acceptance is not an artisan commitment or legal signature. The separate authorized HOLD / UNFUNDED review probe also returned HTTP 201. See A12-02 and [funding-hold-results.json](evidence/funding-hold-results.json).

**Closure failure:** the authoritative assessment returned unresolved adjustment/disposition/entitlement blockers, but the legacy controller accepted CLOSED for the same synthetic order with a pending FinancialAdjustment. Payable/deposit/event checks alone do not cover all financial/inventory authorities. The record and liability survive; closed-order status misrepresents reconciliation. See A12-01.

**Timeliness incompleteness:** pure verified-on-time/late/partial/disputed/overdue/unknown/simulated/failed/overpaid/zero-denominator cases pass. However the native execution CHECK forbids every positive verified settlement expected by the service adapter, and a structured contractual due-date workflow is absent. Authenticated tests prove unavailable/unknown output, not a supported verified-positive end-to-end path. E10-13 is PARTIAL, without relaxing anti-fabrication controls. See A12-03.

**Reconciled existing export scope:** an independent PostgreSQL numeric SUM and a separately parsed downloaded/exported CSV both yielded **12,346 millimes** for two selected material-cost events. Existing full regression independently reconciles artisan liability totals as well. Period bounds, stable IDs, evidence groups, CSV formula protection and scoped/audited export access pass. No beneficiary/contact fields were exposed. Invoice-source reconciliation remains legitimately partial; accepted quotes are neither invoices nor recognized revenue.

Exact negative money/variance and late/partial cash-inflow checks pass. Missing dates and incomplete cost coverage return unavailable minimum gap. Actual recognized contribution remains unavailable pending approved definitions and complete evidence; this was not promoted to profit. Contact opt-out hides contact details and refuses SENT outreach. Unrelated and revoked users are denied. Proposal revisions are append-only and RFQ-backed WON creates no new sample/artisan obligation. The isolated browser checks exercised backend effects, not page rendering alone.

## PostgreSQL, migrations and recovery

Native full-suite evidence confirms **35 applied migrations, 100 pre-Batch8 baseline tables and 130 final public tables** (including migration history). The 100-table comparator is not the immediate pre-Batch12 state. A separate independent populated upgrade started at `20261028130000_planning_intelligence_authority`: **127 → 130 tables**. Existing FinanceRecordEvent columns hashed identically after normal `prisma migrate deploy`; new optional annotations remained null. Native FK failure rolled back prior writes; duplicate versions and append-only history updates were rejected. The added Batch 12 migration is additive; historical SQL-enforced finance/inventory constraints remain intact. Existing Prisma-only removal suggestions were reviewed, never executed.

The new full restore drill verifies **{restore['tables']} tables / {restore['rows']:,} rows**, encrypted configuration, ledger/audit/idempotency hashes; backup **{restore['backupMs']} ms**, restore/verification **{restore['restoreAndVerifyMs']} ms**. This independently reproduces the prior 2,788-row fixture count; encrypted sizes/timings naturally differ. A second audit-built backup used the real CLI, independent key/tamper checks and a separately created target. It compared all **{independent_restore['tables']} tables / {independent_restore['rows']} audit-fixture rows** using sorted JSON row hashes, plus every native constraint definition. PostgreSQL flattened an associative AND grouping in `CommercialOffer.offer_bounds`; only that specific equivalent expression was normalized. No FK/check was removed. [Per-table hashes](evidence/independent-results.json), [constraint source](evidence/source-constraints.txt), [restored constraints](evidence/restored-constraints.txt), [native upgrade](evidence/native-batch12.json).

Reviewed local synthetic targets remain 24-hour RPO and four-hour RTO with the project user as local owner. Millisecond fixture drills are observations, not production guarantees. Wrong-key/tamper/private-file/backup-failure behavior, safe health failures, notification-review alerts and structured redaction pass; hosted/off-site recovery, real paging and production on-call/key custody remain external gates.

## Browser and privacy acceptance

Existing Batch 12 journeys pass at 390/1280px: prospect creation, proposal revisions and won/lost paths, exact cost entry, timeliness display, CSV preparation and closure denial, with axe checks. The independent two journeys add real CSV **download/content validation**, opt-out/history inspection, an actual funding-review HOLD submission, incomplete dated-cash model persistence, a forced network error with successful retry, unauthorized retention view, authenticated governance review, keyboard focus and mobile overflow/axe checks. The nine-class inventory remains legal-review pending and `purgeEnabled=false`; an admin request adding destructive flags is rejected. Consent/contact visibility changes and public trace revocation are not represented as erasure of preserved obligations. Wearable data stays outside commercial retention/ranking/export. E19-01 real participant comprehension remains an unrelated open gate.

## Decision

[Eight-story acceptance matrix](ACCEPTANCE_MATRIX.md): E18-01, E18-02 and E16-08 VERIFIED; E10-11 and E10-13 PARTIAL; E18-03 and E10-14 FAILED_VERIFICATION; E14-09 BLOCKED_EXTERNAL_REVIEW. Existing regression green does not cancel the independent counterexamples. Batch 12 is **not ready for unconditional owner acceptance or a live pilot**. Fix the P1 bypasses and complete/review the identified financial/retention policy-dependent paths before acceptance. Batch 13 may be discussed as planning only; implementation was not started. [Machine-readable summary](evidence/summary.json).
'''
(out/'VERIFICATION_REPORT.md').write_text(report)
print(json.dumps({'tests':counts,'statuses':summary['statuses'],'workspaceChanged':changed},indent=2))
