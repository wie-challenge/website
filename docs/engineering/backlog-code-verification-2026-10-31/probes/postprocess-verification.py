from pathlib import Path
import json,csv,re,hashlib,subprocess,shutil,datetime,collections
W=Path('/home/ashenix/Projects/wie-challenge/website');O=W/'docs/engineering/backlog-code-verification-2026-10-31';S=Path('/tmp/nasj-backlog-verification-20261031')
def write(p,d):p.write_text(json.dumps(d,indent=2,ensure_ascii=False))
def sha(b):return hashlib.sha256(b).hexdigest()
p=O/'GITHUB_LIVE_SNAPSHOT.json';d=json.loads(p.read_text());d['retrievalCommands']=[s.replace('item-list1','item-list 1').replace('field-list1','field-list 1').replace('--limit500','--limit 500') for s in d['retrievalCommands']];write(p,d)
p=O/'FULL_ISSUE_CENSUS.json';d=json.loads(p.read_text());r=d['records']
controller=W/'apps/api/src/modules/procurement/procurement.controller.ts';t=controller.read_text();prefix=re.search(r"@Controller\('([^']*)'\)",t).group(1);routes=[{'method':m.upper(),'path':'/'+prefix+'/'+path,'source':'apps/api/src/modules/procurement/procurement.controller.ts'} for m,path in re.findall(r"@(Get|Post|Patch|Delete|Put)\('([^']*)'\)",t)]
for x in r:
 if x['epicId'] in ['E02','E03','E05','E06','E08','E09','E20']:
  x['apiRoutes']+= [a for a in routes if a not in x['apiRoutes']]
 x['apiRouteLocationsAreSubsystemCandidates']=True;x['freshTestsAreCriterionLinkedOnly']=True
write(p,d)
p=O/'FULL_ISSUE_CENSUS.csv'
with p.open() as f:fields=csv.DictReader(f).fieldnames
with p.open('w') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for x in r:w.writerow({k:json.dumps(x.get(k),ensure_ascii=False) if isinstance(x.get(k),(dict,list)) else x.get(k) for k in fields})
by={x['issueNumber']:x for x in r}
with (O/'HISTORICAL_CANDIDATE_REVALIDATION.csv').open('w') as f:
 fields=['issueNumber','storyId','currentIssueState','currentProjectStatus','currentDisposition','recommendedProjectStatus','unmetCriterionIds','provenance'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for n in d['retainedHistorical40']:
  x=by[n];w.writerow(dict(issueNumber=n,storyId=x['storyId'],currentIssueState=x['githubIssueState'],currentProjectStatus=x['projectStatus'],currentDisposition=x['wholeStoryVerdict'],recommendedProjectStatus=x['recommendedProjectStatus'],unmetCriterionIds=json.dumps([c['id'] for c in x['originalCriteria'] if c['classification'] in ['CONTRADICTED_BY_EVIDENCE','PARTIALLY_IMPLEMENTED','NOT_IMPLEMENTED']]),provenance=d['historical40Provenance']))
for name in ['README.md','FINAL_PROJECT_COMPLETION_REPORT.md','INCORRECTLY_DONE.md']:
 p=O/name;p.write_text(p.read_text()+'\nThe three identities missing from the earlier 37-item reconstruction were **#44, #84 and #85**. The historical denominator “40 of 61” could not be substantiated.\n')
p=O/'README.md';p.write_text(p.read_text()+'\nSource paths are relative to the website repository; ../iot and ../ai-backend refer to sibling repositories. Evidence log and capture paths are relative to this report directory. All classifications are review decisions; owner acceptance is pending.\n')
p=O/'FINAL_PROJECT_COMPLETION_REPORT.md';s=p.read_text().replace('#158 lacks complete required labeled presets/seed controls.','#158 lacks complete required labeled presets/seed controls. Native collection100 and receipt100 succeed, then valid dispatch100 fails EXCESS_HANDOVER; #135.C2/#59.C4 and G19 are affected.').replace('Existing browser14 pass/1 fail;','Existing browser14 pass/1 fail (after successful offer acceptance, dispatch never reaches IN_TRANSIT);')
a=s.index('1. Protect transactional/qualification integrity:');b=s.index('3. Core workflow:',a);chunks=s[a:b].split('\n');s=s[:a]+chunks[1].replace('2. Finance:','1. Security and financial integrity:')+'\n'+chunks[0].replace('1. Protect transactional/qualification integrity:','2. Critical transactional integrity:')+'\n'+s[b:];p.write_text(s)
# Exact committed versus pending working-copy provenance for remediations.
fixfiles={ 'G71':['apps/api/prisma/schema.prisma','apps/api/src/modules/intelligence/intelligence.service.ts','packages/contracts/src/intelligence.ts'],'G27':['apps/api/src/modules/procurement/buyer-document.ts','apps/api/src/modules/procurement/procurement.service.ts'],'G08':['apps/api/src/modules/procurement/eligibility-guard.ts','apps/api/src/modules/procurement/production-offers.ts','apps/api/src/modules/commerce/commerce.service.ts'],'G19':['apps/api/src/modules/procurement/logistics.ts','packages/contracts/src/logistics.ts'],'G20':['apps/api/src/modules/procurement/logistics.ts','packages/contracts/src/logistics.ts','apps/web/src/components/logistics-workspace.tsx'],'G95':['apps/api/src/modules/sales/sales.service.ts']}
provenance={}
for g,paths in fixfiles.items():
 rows=[]
 for rel in paths:
  p=W/rel
  if not p.exists():
   candidates=list(W.glob('apps/api/src/modules/**/'+p.name))
   if len(candidates)==1:p=candidates[0];rel=str(p.relative_to(W))
  cp=subprocess.run(['git','show','HEAD:'+rel],cwd=W,capture_output=True)
  status=subprocess.run(['git','status','--porcelain=v1','--',rel],cwd=W,capture_output=True,text=True).stdout.strip()
  rows.append({'path':rel,'exists':p.exists(),'workingSha256':sha(p.read_bytes()) if p.exists() else None,'headSha256':sha(cp.stdout) if cp.returncode==0 else None,'matchesCommittedHead':p.exists() and cp.returncode==0 and p.read_bytes()==cp.stdout,'gitStatus':status})
 provenance[g]=rows
p=O/'PRESERVATION_REPORT.json';q=json.loads(p.read_text());q['remediationFileCommitProvenance']=provenance;q['custodyProbeHarnessAdaptation']='Disposable support.ts only: invokes its installed Prisma binary directly for migrate deploy, bypassing pnpm dependency auto-install. Original repository untouched. Two earlier probe-launch attempts aborted pnpm dependency auto-install before assertions; these are harness failures, not product findings.';write(p,q)
shutil.copy2(S/'checkout/apps/api/test/support.ts',O/'probes/apps/api/test/support.ts')
p=O/'TEST_EXECUTION_RESULTS.json';q=json.loads(p.read_text());q['probeAuthoringFailures'].append('Custody probe launch initially aborted pnpm dependency auto-install. Disposable harness then invoked the installed Prisma binary directly; native chain assertions executed successfully.');write(p,q)
shutil.copytree(S/'browser-artifacts-original',O/'browser-artifacts-original',dirs_exist_ok=True)
# Validate inventory, immutable original text, exact dispositions and recovered backup hashes.
orig=json.loads((S/'inputs/original-criteria.json').read_text());expected={c['id']:c['text'] for x in orig for c in x['criteria']};actual={c['id']:c['text'] for x in r for c in x['originalCriteria']};assert expected==actual
assert len(by)==213 and sum(x['kind']=='story' for x in r)==192 and len(actual)==1026
assert all(all(c['classification']=='VERIFIED_IMPLEMENTED' for c in x['originalCriteria']) for x in r if x['wholeStoryVerdict']=='KEEP_DONE_VERIFIED')
valid={'VERIFIED_IMPLEMENTED','IMPLEMENTED_NOT_VERIFIED','PARTIALLY_IMPLEMENTED','CONTRADICTED_BY_EVIDENCE','NOT_IMPLEMENTED','EXTERNALLY_BLOCKED','EVIDENCE_UNAVAILABLE'};assert all(c['classification'] in valid for x in r for c in x['originalCriteria'])
manifest=json.loads((W/'docs/documentation-maintenance/preservation-backup/MANIFEST.json').read_text());checks=[sha((W/x['backupPath']).read_bytes())==x['sha256'] for x in manifest['entries']];assert all(checks)
counts=collections.Counter(x['wholeStoryVerdict'] for x in r if x['kind']=='story');assert counts['RECOMMEND_REVIEW_OR_REOPEN']==38 and counts['KEEP_DONE_VERIFIED']==24
old=json.loads((O/'VALIDATION_RESULTS.json').read_text());old.update(allChecksPassed=True,uniqueIssues=len(by),storyCriteria=963,epicGates=63,originalTextChanges=[],backupManifestEntriesVerified=len(checks),currentStoryDispositions=dict(counts),currentCriteriaClassifications=d['summary']['storyCriteriaClassifications'],nativeCustodyRegressionConfirmed=True);write(O/'VALIDATION_RESULTS.json',old)
print(json.dumps({'checks':'PASS','storyDispositions':dict(counts),'backupHashesVerified':len(checks),'fixProvenance':provenance},indent=2))
