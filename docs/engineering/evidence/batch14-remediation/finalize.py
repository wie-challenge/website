from pathlib import Path
import datetime,hashlib,json,re,subprocess,shutil
root=Path(__file__).resolve().parents[4]
e=Path(__file__).resolve().parent
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((e/'baseline.json').read_text())
source=json.loads((e/'tested-source-hashes.json').read_text())
assert all(sha(root/f)==h for f,h in source.items()),'Tested source changed'
allowed={
'apps/api/test/support.ts','apps/web/src/components/demo-feedback-panel.tsx',
'docs/engineering/BATCH14_ACCEPTANCE_MATRIX.md','docs/engineering/BATCH14_VERIFICATION.md',
'docs/engineering/evidence/batch14/verification-summary.json',
'tests/demo-e2e/showroom.spec.ts','tests/e2e/setup.ts'}
changed=[f for f,h in base['files'].items() if not (root/f).is_file() or sha(root/f)!=h]
assert set(changed)==allowed,(set(changed)-allowed,allowed-set(changed))
initial_independent=[f for f in base['files'] if f.startswith('docs/engineering/evidence/batch14-verification/') or f=='docs/engineering/BATCH14_INDEPENDENT_VERIFICATION.md']
assert all(sha(root/f)==base['files'][f] for f in initial_independent)
migrations=[f for f in base['files'] if f.startswith('apps/api/prisma/migrations/') and f.endswith('/migration.sql')]
assert len(migrations)==38 and all(sha(root/f)==base['files'][f] for f in migrations)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head==base['head']
assert subprocess.run(['git','diff','--cached','--quiet'],cwd=root).returncode==0
assert subprocess.run(['git','diff','--check'],cwd=root,capture_output=True).returncode==0
units=(e/'units.log').read_text();integ=(e/'integration.log').read_text();browsers=(e/'e2e-all.log').read_text()
assert re.findall(r'ℹ tests (\d+)',units)==['147','25'] and re.findall(r'ℹ fail (\d+)',units)==['0','0']
assert 'Integration passed: 206 scenarios' in integ
assert '54 passed' in browsers and '17 passed' in browsers and not re.search(r'\n\s*[1-9]\d* failed',browsers)
for name,total in [('focused-browser.json',12),('rate-browser.json',1),('baseline-browser.json',2)]:
 j=json.loads((e/name).read_text());assert j['stats']['expected']==total and j['stats']['unexpected']==0 and j['stats']['skipped']==0
probes=json.loads((e/'adversarial-results.json').read_text());assert len(probes['checks'])==13
assert all(c['result']=='PASS' for c in probes['checks'])
for name,target,count in [('e2e-report.json','application-browser.json',54),('showroom-e2e-report.json','showroom-browser.json',17)]:
 j=json.loads((root/'.local'/name).read_text());assert j['stats']['expected']==count and j['stats']['unexpected']==0
 shutil.copyfile(root/'.local'/name,e/target)
new_files=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()
unexpected=[f for f in new_files if f not in base['files'] and not(f.startswith('docs/engineering/evidence/batch14-remediation/') or f in ['tests/demo-e2e/feedback-recovery.spec.ts','docs/engineering/BATCH14_REMEDIATION_REPORT.md'])]
assert not unexpected,unexpected
preservation={'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'indexUnchanged':True,'changedExistingFiles':changed,'finalDocumentHashes':{f:sha(root/f) for f in sorted(allowed|{'docs/engineering/BATCH14_REMEDIATION_REPORT.md'}) if f.startswith('docs/')},'allInitialIndependentArtifactsUnchanged':True,'initialIndependentArtifactFilesCompared':len(initial_independent),'all38MigrationsUnchanged':True,'testedSourceFiles':len(source),'testedSourceHashesMatchFinalTree':True,'allOtherInitialFilesUnchanged':True,'unexpectedNewFiles':unexpected,'gitStatus':subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all'],cwd=root,text=True)}
(e/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
summary={'date':'2026-10-29','timezone':'Africa/Tunis','story':'E15-06','githubIssue':192,'head':head,'verdict':'B14_IV_02_REMEDIATED_ALL_FIVE_SOFTWARE_CRITERIA_VERIFIED','ownerAcceptance':'PENDING','criteria':{f'C{n}':'VERIFIED_SOFTWARE_CRITERIA' for n in range(1,6)},'findings':{'B14-IV-02':'REMEDIATED_VERIFIED','B14-IV-01':'OPEN_LOW_UNCHANGED','B14-IV-03':'OPEN_LOW_UNCHANGED','B14-IV-04':'METADATA_CORRECTED_HISTORICAL_EVIDENCE_PRESERVED'},'tests':{'apiUnits':147,'webUnits':25,'integrationScenarios':206,'showroomIsolationSubset':9,'batch14MigrationSubset':6,'applicationBrowsers':54,'currentShowroomBrowsers':17,'originalShowroomBrowsers':5,'originalNewBatch14Journeys':2,'newRemediationRegressions':12,'focusedRemediationSubsetRerun':12,'additionalRateBrowserCase':1,'additionalRateBrowserViewports':[390,1280],'adversarialAssertionGroups':13,'historicalIndependentBrowserProbes':6,'baselineBugReproductions':2,'currentIndependentP2SequenceCorrections':2,'focusedAxeCheckpoints':14,'rateAxeCheckpoints':2,'axeViolations':0},'checks':{'lint':'PASS_427_FILES','typecheck':'PASS','build':'PASS','prismaValidation':'PASS','diffCheck':'PASS'},'scope':{'productFilesChanged':['apps/web/src/components/demo-feedback-panel.tsx'],'serverGuaranteesChanged':False,'migrationsChanged':False,'ratePolicyChanged':False,'persistentBrowserDraftStorageAdded':False,'priorIndependentArtifactsChanged':False,'persistentDatabaseTouched':False,'gitIndexChanged':False,'githubChanged':False,'deployed':False,'batch15Started':False},'readyForOwnerAcceptanceReview':True,'externalGates':{'ownerAcceptance':'PENDING','E14-09':'PENDING_QUALIFIED_PRIVACY_REVIEW','realCollectionAuthorized':False,'publicationAuthorized':False}}
(e/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
commands=[
('pnpm exec playwright test --config docs/engineering/evidence/batch14-remediation/baseline.playwright.config.ts','baseline-reproducer.log','2 confirmations of the original defect; original source'),
('pnpm exec playwright test --config docs/engineering/evidence/batch14-remediation/focused.playwright.config.ts','focused-browser.log','12 current-source recovery cases, subset of 17'),
('pnpm exec playwright test --config docs/engineering/evidence/batch14-remediation/rate.playwright.config.ts','rate-browser.log','1 case checks two widths under actual rate policy'),
('pnpm test','units.log','147 API + 25 web'),('pnpm test:integration','integration.log','206 including 9 isolation and 6 migration'),
('pnpm test:e2e','e2e-all.log','54 application + 17 showroom'),
('pnpm exec tsx --tsconfig apps/api/tsconfig.json docs/engineering/evidence/batch14-remediation/adversarial.ts','adversarial.log','13 groups, including two retained LOW counterexamples'),
('pnpm lint','lint.log','427 files'),('pnpm typecheck','typecheck.log','pass'),('pnpm build','build.log','pass'),
('DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused MIGRATION_DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @nasj/api exec prisma validate','schema.log','offline validation'),('git diff --check','diff-check.log','pass')]
(e/'commands.json').write_text(json.dumps([{'command':cmd,'exitCode':0,'log':log,'result':result,'sourceManifest':'baseline.json' if log=='baseline-reproducer.log' else 'tested-source-hashes.json'} for cmd,log,result in commands],indent=2)+'\n')
(e/'artifact-sha256.json').write_text(json.dumps({str(p.relative_to(e)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='artifact-sha256.json'},indent=2)+'\n')
print(json.dumps({'headUnchanged':True,'independentArtifactsPreserved':len(initial_independent),'all38MigrationsUnchanged':True,'testedSourceFiles':len(source),'softwareCriteriaVerified':5,'ownerAcceptance':'PENDING'},indent=2))
