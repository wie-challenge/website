from pathlib import Path
import hashlib,json,subprocess,datetime,re
root=Path(__file__).resolve().parents[4]
e=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((e/'baseline.json').read_text())
changed=[f for f,h in base['sourceHashes'].items() if not (root/f).is_file() or sha(root/f)!=h]
evidence_changed=[f for f,v in base['existingEvidence'].items() if sha(root/f)!=v['sha256']]
protected=['docs/engineering/batch14-planning/'+f for f in ['SCOPE_AUDIT.md','IMPLEMENTATION_BACKLOG.md','TECHNICAL_PLAN.md']]+['docs/engineering/BATCH13_INDEPENDENT_VERIFICATION.md']
protected_results={f:hashlib.sha256(subprocess.check_output(['git','show','HEAD:'+f],cwd=root)).hexdigest()==sha(root/f) for f in protected}
status=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all'],cwd=root,text=True)
index_unchanged=subprocess.run(['git','diff','--cached','--quiet'],cwd=root).returncode==0
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
tracked_unchanged=subprocess.run(['git','diff','--quiet'],cwd=root).returncode==0
unexpected=[s for s in status.splitlines() if not(s.startswith('?? docs/engineering/evidence/batch14-verification/') or s=='?? docs/engineering/BATCH14_INDEPENDENT_VERIFICATION.md')]
assert not changed and not evidence_changed and all(protected_results.values()) and not unexpected
assert index_unchanged and tracked_unchanged and head==base['head']
(e/'final-preservation.json').write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'sourceFilesCompared':len(base['sourceHashes']),'changedSourceFiles':changed,'changedOriginalEvidence':evidence_changed,'protectedDocumentsMatchHEAD':protected_results,'indexUnchanged':index_unchanged,'trackedFilesUnchanged':tracked_unchanged,'unexpectedFiles':unexpected,'status':status,'sourceHashes':base['sourceHashes']},indent=2)+'\n')
units=(e/'units.log').read_text();integration=(e/'integration.log').read_text();browser=(e/'e2e-all.log').read_text();probes=json.loads((e/'adversarial-results.json').read_text());independent=json.loads((e/'independent-browser.json').read_text())
assert 'Integration passed: 206 scenarios' in integration
assert '54 passed' in browser and '5 passed' in browser and not re.search(r'\n\s*[1-9]\d* failed',browser)
assert re.findall(r'ℹ tests (\d+)',units)==['147','25']
assert len(probes['checks'])==13 and all(x['result']=='PASS' for x in probes['checks'])
assert independent['stats']['expected']==6 and independent['stats']['unexpected']==0 and independent['stats']['skipped']==0
summary={'batch':14,'story':'E15-06','issue':192,'date':'2026-10-29','timezone':'Africa/Tunis','head':head,'verdict':'QUALIFIED_VERIFICATION_C5_PARTIAL','ownerAcceptance':'PENDING','criteria':{'C1':'VERIFIED_SOFTWARE','C2':'VERIFIED_SOFTWARE','C3':'VERIFIED_SOFTWARE','C4':'VERIFIED_SOFTWARE','C5':'PARTIALLY_VERIFIED'},'findings':{'P0':0,'P1':0,'P2':1,'LOW':2,'INFO':1},'tests':{'apiUnits':147,'webUnits':25,'integration':206,'showroomIsolationSubset':9,'batch14MigrationSubset':6,'separateShowroomRerun':9,'applicationBrowsers':54,'showroomBrowsers':5,'newOriginalE15BrowserTests':2,'independentAdversarialGroups':13,'independentBrowsers':6,'independentBrowserKnownDefectReproductions':2,'independentBrowserFunctionalAccessibilityCases':4,'independentAxeViolations':0},'checks':{'lint':'PASS_426_FILES','typecheck':'PASS','build':'PASS','prismaValidation':'PASS','diffCheck':'PASS'},'migration':{'count':38,'historicalSqlUnchanged':37,'populatedUpgradePreservedBaselineTables':132},'sourcePreservation':{'files':len(base['sourceHashes']),'changed':0,'originalEvidenceChanged':0},'gates':{'E14-09':'PENDING_QUALIFIED_PRIVACY_REVIEW','ownerAcceptance':'PENDING','realCollectionEnabled':False,'publicationAuthorized':False},'readyForUnconditionalOwnerAcceptanceRecommendation':False,'backlogReconciliation':'READ_ONLY_INVENTORY_ONLY_CARRY_QUALIFIED_RESULT','persistentDatabaseTouched':False,'productCodeChanged':False,'githubChanged':False}
(e/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(e/'artifact-sha256.json').write_text(json.dumps({str(p.relative_to(e)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='artifact-sha256.json'},indent=2)+'\n')
print(json.dumps({'sourceFilesUnchanged':len(base['sourceHashes']),'originalEvidenceChanged':len(evidence_changed),'trackedFilesUnchanged':tracked_unchanged,'independentBrowsers':independent['stats'],'summary':'summary.json'},indent=2))
