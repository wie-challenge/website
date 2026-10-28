from pathlib import Path
import json,re,collections,hashlib,subprocess,datetime
out=Path(__file__).resolve().parent.parent;ev=out/'evidence';root=out.parents[2]
commands=json.loads((ev/'commands.json').read_text());assert len(commands)==9 and all(c['exitCode']==0 for c in commands),commands
read=lambda name:(ev/name).read_text()
def count(log,pattern):return int(re.search(pattern,read(log))[1])
counts={'apiUnit':count('api-unit.log',r'ℹ pass (\d+)'),'webUnit':count('web-unit.log',r'ℹ pass (\d+)'),'integration':count('integration.log',r'Integration passed: (\d+)'),'applicationBrowser':count('browser.log',r'\b(\d+) passed'),'showroom':int(re.findall(r'\b(\d+) passed',read('browser.log'))[-1]),'targetedIntegrationIncludingBootstrap':count('targeted-verified.log',r'Integration passed: (\d+)'),'targetedBrowser':count('browser-targeted-verified.log',r'\b(\d+) passed'),'targetedUnit':count('unit-targeted.log',r'ℹ pass (\d+)')}
assert counts=={'apiUnit':133,'webUnit':25,'integration':176,'applicationBrowser':52,'showroom':3,'targetedIntegrationIncludingBootstrap':39,'targetedBrowser':4,'targetedUnit':10},counts
for name in ['api-unit.log','web-unit.log']:assert 'ℹ fail 0' in read(name) and 'ℹ skipped 0' in read(name)
rows=[json.loads(l) for l in read('integration.log').splitlines() if l.startswith('{"evidence":')]
native=next(r for r in rows if r['evidence']=='DISPOSABLE_NATIVE_POSTGRESQL_MIGRATIONS');restore=next(r for r in rows if r['evidence']=='DISPOSABLE_ENCRYPTED_SYNTHETIC_RESTORE')
assert native['migrations']==36 and native['finalPublicTables']==131 and restore['contractualDateRows']>0
source=json.loads((ev/'release-source-hashes.json').read_text());changed=[p for p,h in source['files'].items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h];assert not changed,changed
scenarios=[]
for marker in read('integration.log').splitlines():
 if marker.startswith('PASS R12 '):scenarios.append({'name':marker[5:],'result':'PASS','test':'apps/api/test/batch12.scenarios.ts'})
assert len(scenarios)==10
(ev/'scenarios.json').write_text(json.dumps(scenarios,indent=2)+'\n')
original=json.loads((root/'docs/engineering/evidence/batch12/acceptance-evidence.json').read_text());assert len(original)==8 and sum(len(r['criteria']) for r in original)==41
meta={
'E18-01':('VERIFIED_SOFTWARE_CRITERIA','Existing scoped discovery/qualification/contact histories retained; all-stage RFQ authorization is stricter.','Full Batch12 HTTP and mobile/desktop regressions pass.','None identified in software scope.','Real contact-basis evidence and owner acceptance remain separate.'),
'E18-02':('VERIFIED_SOFTWARE_CRITERIA','RFQ references persist at DRAFT/SENT/WON and cannot silently change/disappear; immutable historical JSON links remain read-compatible. No proposal creates artisan obligations.','R12 missing/HOLD/REJECT, current approval, both WON orderings and browser proposal histories.','None identified in the authorized RFQ conversion path.','Real buyer outcomes and signed-contract evidence are not fabricated.'),
'E18-03':('PARTIALLY_IMPLEMENTED','A12-02 repaired: acceptance requires exact current quote/cost/feasibility/RFQ/funding review for linked RFQs or explicit finance-reviewed RFQs.','Four new permanent funding checks; missing, HOLD/UNFUNDED, REJECT, stale assumptions/cost/quote and concurrent idempotent acceptance.','Supported actual recognized contribution and complete actual cost/revenue evidence remain unavailable.','Approved recognition definitions, complete actual evidence and funding-policy ownership.'),
'E10-11':('PARTIALLY_IMPLEMENTED','Existing source-based, scoped, audited accounting CSV preserved; no second ledger or invoice mapping added.','Existing independent source-liability and cost reconciliation plus full browser/export regression.','Approved invoice-subledger reconciliation/classification remains absent.','Approved invoice/tax policy and source evidence.'),
'E10-13':('PARTIALLY_IMPLEMENTED','A12-03 software preparation: append-only ContractualDueDate source/correction history, exact terms-version binding, and separate operational/reported/simulated states. No free-text date parsing or verified-payment fabrication.','Three permanent native/HTTP checks, two new units and the extended real browser due-date/partial-report journey. Existing pure verified-case tests remain model tests only.','Verified-positive service settlement remains unavailable under the preserved execution_unverified constraint.','Approved bank/provider/manual settlement-verification policy and genuine source evidence; positive states require that authority.'),
'E10-14':('PARTIALLY_IMPLEMENTED','A12-01 repaired: one transaction-bound FinanceService.assess gates the legacy CLOSED transition and finance decision; related adjustments, receivables, stock, payables, sample obligations and events cannot be bypassed.','Exact pending-adjustment HTTP 409 counterexample; material/payable/dispute/partial buyer evidence; concurrent adjustment/close; repeat/exception denial; linked sample regression.','Lawful positive financial close and authorized exceptions remain disabled. Pure source-free synthetic legacy behavior is explicitly separate from verified settlement.','Approved settlement, entitlement, material disposition, invoice and lawful exception policies.'),
'E16-08':('VERIFIED_SOFTWARE_CRITERIA','Existing encrypted backup/restore and native migration verification reused, now with populated contractual-date history.','36 native migrations; 131-table restore including all new date rows; row hashes, constraints, rollback/history and normal upgrade regression pass.','No missing local software criterion identified.','Hosted/off-site recoverability, named production ownership, key custody and actual RTO/RPO validation remain separate.'),
'E14-09':('BLOCKED_EXTERNAL_REVIEW','Existing governed inventory and no-destructive-purge boundary preserved. New date evidence belongs to the financial-record purpose class.','Existing retention authorization/no-purge and privacy regressions pass.','Retention durations, preservation exceptions, named responsibilities and removal procedures need qualified review.','Qualified privacy/legal policy review; no Tunisian compliance or production approval asserted.'),
}
order=['E18-01','E18-02','E18-03','E10-11','E10-13','E10-14','E16-08','E14-09']
def cell(v):return str(v).replace('|','\\|').replace('\n','<br>')
lines=['# Updated Batch 12 acceptance matrix','','28 October 2026 · Africa/Tunis. Exactly eight stories / 41 original criteria. Historical implementation and independent-audit documents remain unchanged. Owner acceptance is **PENDING** for every story.','',
'| Story | GitHub issue | Original criteria | Implementation | Executed evidence | Missing criteria | Software status | External review gate | Owner acceptance |','|---|---|---|---|---|---|---|---|---|']
records=[]
for sid in order:
 old=next(r for r in original if r['story']==sid);status,implementation,test,missing,gate=meta[sid]
 row={'story':sid,'issue':old['issue'],'originalCriteria':old['criteria'],'implementation':implementation,'tests':test,'missingCriteria':missing,'softwareStatus':status,'externalGate':gate,'ownerAcceptance':'PENDING'};records.append(row)
 values=[sid,f"[#{old['issue'].split('/')[-1]}]({old['issue']})",'<br>'.join(f'C{i+1}: {c}' for i,c in enumerate(old['criteria'])),implementation,test,missing,status,gate,'PENDING'];lines.append('| '+' | '.join(cell(v) for v in values)+' |')
lines+=['','Disposition: **3 VERIFIED_SOFTWARE_CRITERIA, 4 PARTIALLY_IMPLEMENTED, 1 BLOCKED_EXTERNAL_REVIEW; 0 owner-accepted**. E18-03 and E10-14 move from FAILED_VERIFICATION to PARTIAL after their counterexamples deny correctly. E10-13 remains PARTIAL; safe preparation is not a verified-positive payment authority.','',
'An independent follow-up review of the financial gates is recommended before accepting Batch 12 or starting Batch 13 implementation. No Batch 13 work was started. The earlier E19-01 participant-comprehension gate remains open.']
(out/'UPDATED_ACCEPTANCE_MATRIX.md').write_text('\n'.join(lines)+'\n');(ev/'acceptance.json').write_text(json.dumps(records,indent=2)+'\n')
assert len(re.findall(r'^\| E\d{2}-\d{2}',(out/'UPDATED_ACCEPTANCE_MATRIX.md').read_text(),re.M))==8
summary={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':source['head'],'tests':counts,'newPermanentIntegrationScenarios':10,'newApiUnitTests':2,'commands':'commands.json','nativeMigration':native,'restore':restore,'sourceFilesChangedSinceReleaseCapture':changed,'softwareStatuses':dict(collections.Counter(r['softwareStatus'] for r in records)),'ownerAcceptance':'PENDING_ALL_EIGHT','beforeAfter':{'A12-01':{'before':'201 CLOSED with pending adjustment','after':'409 FINANCIAL_CLOSURE_REQUIRED; order remains SETTLED, liability preserved'},'A12-02':{'before':'201 accepted without review or despite HOLD/UNFUNDED','after':'409 FINANCE_REVIEW_REQUIRED for missing/HOLD/REJECT/stale; current approved evidence allows one authoritative acceptance'},'A12-03':{'before':'Unreachable verified branch and free-text date lookup','after':'Native structured immutable due-date evidence and explicit supported-state reporting; verified-positive unavailable, story PARTIAL'}},'committedOrStaged':False,'deployed':False,'persistentDatabaseTouched':False,'historicalReportsChanged':False}
(ev/'verification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'REMEDIATION_REPORT.md').write_text(f'''# Batch 12 financial remediation

28 October 2026 · Africa/Tunis. **A12-01 and A12-02 are repaired and their exact counterexamples now deny. A12-03 has safe due-date/state-reporting preparation; verified-positive settlement remains unavailable and E10-13 remains PARTIAL.** All work is uncommitted and unstaged. Historical reports/audit evidence were preserved; no persistent migration, deployment, GitHub mutation, real transfer or new feature batch occurred.

## A12-01 — one closure authority

The legacy CLOSED guard used an incomplete list of tables and optional FinanceRecordEvent.orderId annotations. `CommerceService.orderAction` now invokes `FinanceService.assess` inside the existing IAM transaction. The same assessment serves financial readiness and persisted finance closure decisions. It follows real relationships from the order/RFQ, acceptance, batches, linked sample/payable sources, deposits, requests/executions, adjustments, disputes and material records, including older target-ID finance events. It adds explicit unknown/unreconciled buyer receivable reasons.

A source-free historical synthetic state machine remains available only when no authoritative finance/inventory/sample/logistics source exists; its existing quantity, simulated settlement and disposition rules are checked by the same assessment. This is not verified financial closure. Managed/ledger-backed closure still fails closed without approved policy. Explicit finance exceptions remain denied and cannot erase debt.

IAM advisory locks serialize closure with existing adjustment/financial writers. Financial writes refuse a CLOSED order without a reviewed reopening policy, so concurrent requests cannot add an accepted adjustment after a source-free synthetic close. Permission checks precede that status disclosure. Existing idempotency, scoped authority and actor/reason/snapshot audit behavior remain.

**Before:** 201/CLOSED with PENDING_REVIEW adjustment. **After:** 409/FINANCIAL_CLOSURE_REQUIRED; order stays SETTLED and adjustment stays pending. The finance endpoint records DENIED rather than approving an exception. New permanent checks also cover stock readiness, outstanding payable, dispute, partial buyer evidence, repeated denial and concurrency; existing sample tests preserve exact linked sample liabilities.

## A12-02 — review before commitment, independent of WON

Authorized RFQ links now persist in every proposal revision at DRAFT/SENT/WON; later revisions inherit a link rather than silently dropping it, and changing RFQ requires a separate proposal. Old JSON-only links are read through an explicit matching-buyer/operator compatibility predicate, preserving append-only history rather than updating old rows.

The documented applicability boundary is **an explicitly linked sales RFQ at any historical stage, or an RFQ with an explicit finance-review record**. Unrelated historical procurement has no new blanket gate. A salesperson cannot disable a gate by recording LOST, omitting a reference or delaying WON.

The latest ordered finance review must approve DOCUMENTED_PLAN and bind the exact RFQ version/terms, quote revision/expiry/snapshot, current cost and feasibility evidence, plus funding status/evidence. A shared canonical hash helper prevents Prisma include-shape differences and preserves exact millimes. Append-only review versions order decisions independently of transaction-start timestamps. Missing, HOLD/UNFUNDED, REJECT, changed assumptions/cost/quote or withdrawn funding deny acceptance. Newer costing requires a fresh costed quote and review. No approval implies bank verification.

**Before:** 201 with no review or with explicit HOLD/UNFUNDED. **After:** 409/FINANCE_REVIEW_REQUIRED in both cases. Current approved evidence still permits one idempotent authoritative acceptance, whether WON is recorded before or after it; no sample commitment, payable or artisan acceptance is created by the proposal.

## A12-03 — explicit contractual evidence, honest operational states

Additive migration `20261028150000_financial_remediation_dates` introduces **ContractualDueDate**, an evidence/history table linked to the existing ArtisanPayable ledger. It records an exact date or explicit UNKNOWN, source evidence, actor/reason, version/correction chain, originating offer/sample reference, exact immutable payable-terms SHA version and offer version at recording. It never rewrites accepted terms or changes amounts. Unique versions, FKs, known/unknown checks, same-payable predecessor checks and append-only triggers protect history.

`GET/POST /api/v1/finance/orders/:id/contractual-dates` applies existing assigned finance/reconciliation authorization and exact order/sample-payable scope. Corrections append a new record. The report no longer parses arbitrary payment-condition text for dates. The finance UI records/reads evidence history and shows its source/version and unverified status.

Timeliness separately exposes request and execution statuses, scheduled/initiation/pending/failure states where represented, dispute, partial unverified reports, overpayment review, simulations and unknowns. Reported amounts are not paid amounts; denominator exclusions and the unavailable-verification boundary are explicit. **The native execution_unverified constraint is unchanged.** No reviewed bank/provider/manual verification authority exists, so no verified-positive DB row or real payment is fabricated. Pure positive-case arithmetic remains a model test, not service acceptance evidence.

## Verification and disposition

Final results: **{counts['apiUnit']} API units, {counts['webUnit']} web units, {counts['integration']} HTTP/native integration scenarios, {counts['applicationBrowser']} application browser tests and {counts['showroom']} showroom tests passed**. Ten new permanent HTTP scenarios and two new units extend the existing harness. Four targeted browser journeys passed, including actual due-date evidence entry, partial-report display, HOLD submission and mobile/desktop regression. [Executed commands and migration/restore detail](REGRESSION_RESULTS.md).

Native PostgreSQL 17.7 applied **36 migrations / 131 public tables**. The restore drill now runs after Batch 12 scenarios so the archive includes **{restore['contractualDateRows']} populated contractual-date history rows**; all {restore['tables']} tables / {restore['rows']:,} rows and source hashes restored. Old migrations/constraints were preserved. No new package or parallel ledger was introduced.

[Updated matrix](UPDATED_ACCEPTANCE_MATRIX.md): **3 verified, 4 partial, 1 blocked external review; all owner acceptance PENDING**. Actual contribution, invoice reconciliation, verified settlement, lawful positive close and retention approval remain separate evidence/policy gates. Another independent review of the repaired financial boundaries is recommended before Batch 12 acceptance and Batch 13 implementation. Batch 13 remains unstarted.
''')
(out/'REGRESSION_RESULTS.md').write_text(f'''# Batch 12 remediation regression results

28 October 2026 · Africa/Tunis. [commands.json](evidence/commands.json) records each exact command, cwd, start/end UTC, exit code and full log. All nine final commands exited **0**. [Source hashes](evidence/release-source-hashes.json) pin the uncommitted inputs; no captured source changed during verification (Next-generated imports are explicitly excluded).

## Executed checks

- `pnpm test:integration`: **176 passed** (166 prior + 10 permanent remediation checks); no skipped scenario path. Real authenticated requests and native PostgreSQL, not mocked money or an impossible settlement state.
- `pnpm test:e2e`: **52 application tests and 3 showroom tests passed**, zero failures/skips. Added assertions extend existing journeys rather than inflating named browser-test counts.
- `pnpm --filter @nasj/api test`: **133 passed**, zero failures/skips (131 prior + 2 units).
- `pnpm --filter @nasj/web test`: **25 passed**, zero failures/skips.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, Prisma validate from `apps/api`, `git diff --check`: pass.

Targeted evidence: **39 integration/bootstrap checks**, of which 26 are Batch 12 and 10 are new remediation checks; **4 browser tests**; **10 targeted Batch 12 units**. These overlap the full suite and are not additional unique totals. [Ten-scenario index](evidence/scenarios.json), [machine summary](evidence/verification-summary.json).

## Exact negative counterexamples

- `R12 closure exact pending-adjustment counterexample`: invalid legacy close returns **409**, finance close records **DENIED**, order remains SETTLED and FinancialAdjustment remains PENDING_REVIEW. No blocker fixture was removed. Repeat denial and unauthorized/policy-exception paths remain fail-closed.
- `R12 SENT proposal keeps an authorized RFQ link`: absent review, **HOLD/UNFUNDED** and **REJECT** each return **409**, with zero created orders. Current review permits one authoritative concurrent/idempotent acceptance; stale RFQ, changed costing, superseded quote and withdrawn funding deny. Historical JSON links stay gated.
- `R12 contractual dates...` and two supported-state checks: valid date/UNKNOWN pairing, immutable correction history, version/tenant denial, no agreement rewrite, scheduled/pending/failed/partial/disputed/simulated/overpayment reporting, zero verified denominator. A native attempted verified row is rejected by the existing CHECK. Arbitrary JSON payment-condition dates are ignored.

## Native migration, preservation and restore

Only `20261028150000_financial_remediation_dates` was authored for remediation; total chain **36**. Fresh native deploy, populated old-column preservation, migration checksums, rollback, concurrency/uniqueness, append-only evidence and existing finance/inventory constraints pass in the established harness. The comparator is **100 pre-Batch8 baseline tables → 131 final public tables**, including migration history; immediate pre-remediation schema had 130 tables. New date-table FKs/unique/correction checks are exercised through PostgreSQL and HTTP.

The protected encrypted backup/restore verifies **131 tables / {restore['rows']:,} rows**, including **{restore['contractualDateRows']} contractual-date rows**, configuration recovery and financial/audit/idempotency history. Measured backup **{restore['backupMs']} ms** and restore/verify **{restore['restoreAndVerifyMs']} ms** are disposable drill observations, not production RPO/RTO guarantees. The original twenty Batch 8–11 tables still have {native['foreignKeys']} foreign keys. Prisma-only preexisting removal suggestions remain reviewed output; no enforced SQL FK was dropped.

## Diagnostic history and limits

Targeted iterations found and corrected a review snapshot include-shape mismatch, strict JSON typing/native simulated-state fixture issues, and the new browser actor’s missing explicit date-recording permission. The first browser attempt was stopped to reload that corrected fixture; the final targeted run passed all four tests. Earlier logs are diagnostic, not final passing gates. Expected-invalid assertions were not weakened to accept bad behavior. The final complete regression was run once after these corrections.

All databases were newly created disposable harness containers. No persistent data, showroom generation, GitHub issue, deployment, staging or commit was changed. Historical engineering/audit reports remain intact. Approved settlement/recognition/invoice/exception/retention policy and genuine real-world evidence remain external gates; no test is presented as legal, financial or banking validation.
''')
print(json.dumps({'tests':counts,'statuses':summary['softwareStatuses'],'migrations':native['migrations'],'restoreDateRows':restore['contractualDateRows']},indent=2))
