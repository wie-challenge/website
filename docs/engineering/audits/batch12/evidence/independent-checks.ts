import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import { randomUUID,createHash,randomBytes } from 'node:crypto';
import { writeFile,readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { seedCommerceFixture } from '../../../../../apps/api/test/commerce.fixture.js';
import { disposableDatabase } from '../../../../../apps/api/test/support.js';
import { paymentTimeliness,cashGap } from '../../../../../apps/api/src/modules/finance/analysis.js';
import { encryptBackup,decryptBackup,unpackDatabaseBackup } from '../../../../../apps/api/src/operations/backup.js';
const exec=promisify(execFile);
const path=join(process.cwd(),'docs/engineering/audits/batch12/evidence');
export async function independentChecks({db,register,check,database}:any){
 const records:any[]=[];const record=(id:string,result:unknown)=>{records.push({id,...result as object});writeFileSync(join(path,'independent-results.json'),JSON.stringify(records,null,2)+'\n');};
 const [sales,buyer,artisan,quality,stranger]=await Promise.all(['sales','buyer','artisan','quality','stranger'].map(r=>register('audit-b12-'+r+'@example.com','Synthetic Independent '+r)));
 const fixture=await seedCommerceFixture(db,{buyerId:buyer.me.user.id,operatorId:sales.me.user.id,artisanId:artisan.me.user.id,qualityId:quality.me.user.id,outsiderId:stranger.me.user.id},'independent-b12');
 const member=await db.organizationMember.findFirstOrThrow({where:{organizationId:fixture.operatorOrganizationId,userId:sales.me.user.id}});
 await db.membershipRole.createMany({data:['BUSINESS_DEVELOPMENT','NASJ_OPERATOR','PRODUCT_DESIGNER'].map(role=>({membershipId:member.id,role,assignedByUserId:sales.me.user.id}))});
 await db.membershipPermission.createMany({data:['finance.payable.reconcile','finance.accounting.export','finance.closure.assess'].map(permission=>({membershipId:member.id,permission,grantedById:sales.me.user.id,reason:'Synthetic independent audit authority'}))});
 await db.operatorAssignment.create({data:{operatorId:sales.me.user.id,organizationId:fixture.buyerOrganizationId,assignedById:sales.me.user.id}});
 const send=async(who:any,route:string,data:any,key=randomUUID())=>{const me=await who.client.request('/api/v1/me');return who.client.request('/api/v1/'+route,'POST',data,{'X-CSRF-Token':me.body.csrfToken,'Idempotency-Key':key});};
 const ok=(r:any)=>{assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};
 const details={segment:'Hospitality',needs:'Independent sample scope',qualificationNotes:'Discovery only',status:'LEAD',ownerId:sales.me.user.id,nextAction:'Independent follow-up',followUpAt:null,contactBasis:'CONSENT',basisEvidence:'Synthetic consent',contactReviewAt:'2027-12-01T00:00:00Z',reason:'Independent scoped discovery'};
 const prospect=ok(await send(sales,'sales/prospects',{...details,operatorOrganizationId:fixture.operatorOrganizationId,buyerOrganizationId:fixture.buyerOrganizationId}));
 const product=await db.productSpecification.create({data:{ownerOrganizationId:fixture.operatorOrganizationId,productCode:'AUDIT-'+randomUUID(),name:'Independent synthetic product',craftSkillId:'weaving',authorId:sales.me.user.id}});
 const spec=await db.productSpecificationRevision.create({data:{specificationId:product.id,revisionNumber:1,status:'APPROVED',description:'Independent source',dimensions:'10 cm',materials:[],instructions:'Follow source',tolerances:'1 mm',qualityCriteria:'Review dimension',referenceImages:[],authorId:sales.me.user.id}});
 const proposal={version:1,specificationRevisionId:spec.id,quantity:1,proposedPriceTnd:'100.001',estimatedCostTnd:'70.001',validUntil:'2027-12-01T00:00:00Z',timing:'No production commitment',responsibilities:'Review only',status:'DRAFT',buyerResponse:'Pending',reason:'Independent scope',feedback:'',decisionAt:null};
 const draft=ok(await send(sales,`sales/prospects/${prospect.id}/proposals`,proposal));
 await check('AUDIT contact opt-out rejects outreach; unrelated actor and revoked membership are denied',async()=>{
  ok(await send(sales,`sales/prospects/${prospect.id}`,{...details,version:1,contactBasis:'DO_NOT_CONTACT'}));
  const denied=await send(sales,`sales/prospects/${prospect.id}/proposals`,{...proposal,version:2,groupId:draft.groupId,status:'SENT'});assert.equal(denied.status,409);assert.equal(denied.body.code,'CONTACT_PERMISSION_REQUIRED');
  assert.equal((await stranger.client.request('/api/v1/sales')).status,404);
  await db.organizationMember.update({where:{id:member.id},data:{status:'SUSPENDED'}});assert.equal((await sales.client.request('/api/v1/sales')).status,404);await db.organizationMember.update({where:{id:member.id},data:{status:'ACTIVE'}});
  ok(await send(sales,`sales/prospects/${prospect.id}`,{...details,version:2}));record('CONTACT_SCOPE',{outcome:'PASS'});
 });
 const rfq=await db.commercialRfq.create({data:{buyerOrganizationId:fixture.buyerOrganizationId,operatorOrganizationId:fixture.operatorOrganizationId,craftSkillId:'weaving',title:'Independent quotation',specification:'Approved synthetic terms',designRequirements:'Independent terms',quantity:1,deliveryAt:new Date(fixture.deliveryAt),deliveryLocation:'Synthetic Tunis',status:'QUOTED',procurementManaged:true}});
 const rev=await db.procurementRevision.create({data:{rfqId:rfq.id,version:1,authorId:sales.me.user.id,reason:'Independent source',snapshot:{provenance:'SYNTHETIC'}}});
 const feasible=await db.feasibilityAssessment.create({data:{rfqId:rfq.id,version:1,rfqVersion:1,result:'FEASIBLE',unitType:'PIECES',requestedQuantity:'1',knownRemaining:'10',effortMin:'5',effortMax:'10',constraints:[],explanation:'Independent fixture',assumptions:{provenance:'SYNTHETIC'},authorId:sales.me.user.id}});
 const estimate=await db.costEstimate.create({data:{rfqId:rfq.id,version:1,feasibilityAssessmentId:feasible.id,quantity:1,components:[{category:'ARTISAN_LABOR',amountTnd:'70.001'}],subtotalMillimes:70001n,marginMethod:'NONE',marginBasisPoints:0,sellingMillimes:100001n,incomplete:false,status:'APPROVED',authorId:sales.me.user.id,snapshot:{provenance:'SYNTHETIC'}}});
 const quote=await db.procurementQuote.create({data:{rfqId:rfq.id,version:1,revisionId:rev.id,authorId:sales.me.user.id,totalMillimes:100001n,expiresAt:new Date(fixture.quoteExpiresAt),snapshot:{provenance:'SYNTHETIC'},costEstimateId:estimate.id,feasibilityAssessmentId:feasible.id,termsSha256:'ab'.repeat(32)}});
 await check('AUDIT reproduce finance-review bypass when the proposal is SENT but not WON',async()=>{
  ok(await send(sales,`sales/prospects/${prospect.id}/proposals`,{...proposal,version:2,groupId:draft.groupId,status:'SENT',rfqId:rfq.id}));
  const count=await db.financeRecordEvent.count({where:{targetId:rfq.id,targetType:'RfqFinanceReview'}});assert.equal(count,0);
  const accepted=await send(buyer,`procurement/rfqs/${rfq.id}/accept`,{version:1,quoteId:quote.id,termsSha256:quote.termsSha256,confirm:true});
  record('FUNDING_BEFORE_WON',{required:'DENY_FINANCE_REVIEW_REQUIRED',actualStatus:accepted.status,actualCode:accepted.body.code??'ACCEPTED',reviewCount:count,orderId:accepted.body.id});assert.equal(accepted.status,201,'Reproduction changed; inspect result');
 });
 const order=await db.commercialOrder.findUniqueOrThrow({where:{rfqId:rfq.id}});
 await check('AUDIT independent CSV sums match exact PostgreSQL source costs and omit unrelated records',async()=>{
  for(const [source,amount] of [['audit-source-1','12.345'],['audit-source-2','0.001']])ok(await send(sales,`finance/orders/${order.id}/costs`,{category:'MATERIAL',amountTnd:amount,sourceReference:source,occurredAt:'2026-10-15T00:00:00Z',provenance:'SYNTHETIC',reason:'Independent exact source'}));
  const result=await sales.client.request(`/api/v1/finance/orders/${order.id}/accounting-export?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z`);assert.equal(result.status,200);
  const sql=await db.$queryRawUnsafe(`SELECT SUM(("data"->>'amountTnd')::numeric * 1000)::bigint::text AS total FROM "FinanceRecordEvent" WHERE "orderId"=$1 AND "targetType"='OrderCostEvidence' AND ("data"->>'occurredAt')::timestamptz >= '2026-10-01' AND ("data"->>'occurredAt')::timestamptz < '2026-11-01'`,order.id);
  const csv=result.body.csv.split('\r\n').filter((line:string)=>line.includes('COST_MATERIAL'));
  const sum=csv.reduce((n:bigint,line:string)=>{const c=line.slice(1,-1).split('","');const [whole,fraction]=c[6].split('.');return n+BigInt(whole)*1000n+BigInt(fraction);},0n);assert.equal(sum.toString(),String(BigInt(sql[0].total)));assert.equal(sum,12346n);
  record('CSV_RECONCILIATION',{outcome:'PASS',sqlMillimes:sql[0].total,csvMillimes:sum.toString(),costRows:csv.length});
 });
 await check('AUDIT verified timeliness path is blocked by native settlement constraints',async()=>{
  const defs=await db.$queryRawUnsafe(`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"PayoutExecutionRecord"'::regclass AND contype='c'`);
  assert.ok(defs.some((r:any)=>r.definition.includes('NOT "bankVerified"')));
  record('TIMELINESS_REACHABILITY',{required:'Immutable contractual due dates and verified settlement path',actual:'execution_unverified forbids bankVerified and VERIFIED_SETTLED; no current payable writer sets paymentDueAt',constraints:defs});
 });
 await check('AUDIT pure timeliness covers all eleven requested evidence cases',async()=>{
  const base={id:'on-time',amount:1000n,dueAt:'2026-10-15T00:00:00Z',createdAt:'2026-10-01T00:00:00Z',provenance:'OBSERVED',disputed:false,settlements:[{amount:1000n,date:'2026-10-14T00:00:00Z',verified:true,status:'VERIFIED_SETTLED'}]};
  const cases=[base,{...base,id:'late',settlements:[{...base.settlements[0],date:'2026-10-16T00:00:00Z'}]},{...base,id:'partial',settlements:[{...base.settlements[0],amount:500n}]},{...base,id:'disputed',disputed:true},{...base,id:'outstanding',settlements:[]},{...base,id:'unknown-due',dueAt:null},{...base,id:'unknown-settled',settlements:[{...base.settlements[0],date:null}]},{...base,id:'synthetic',provenance:'SYNTHETIC'},{...base,id:'failed',settlements:[{...base.settlements[0],status:'FAILED'}]},{...base,id:'overpaid',settlements:[{...base.settlements[0],amount:1001n}]}];
  const r=paymentTimeliness(cases,'2026-10-01T00:00:00Z','2026-11-01T00:00:00Z',new Date('2026-11-01T00:00:00Z'));assert.equal(r.eligiblePaymentCount,2);assert.equal(r.onTimePercentage,50);assert.equal(r.unverifiedUnknownCount,8);assert.equal(paymentTimeliness([],'2026-10-01','2026-11-01').onTimePercentage,null);record('TIMELINESS_PURE',{outcome:'PASS',...r});
 });
 await check('AUDIT legacy closing ignores an unresolved financial adjustment',async()=>{
  const legacy=await db.commercialRfq.create({data:{buyerOrganizationId:fixture.buyerOrganizationId,operatorOrganizationId:fixture.operatorOrganizationId,craftSkillId:'weaving',title:'Independent legacy close',specification:'Synthetic legacy terms',designRequirements:'Independent closure boundary',quantity:1,deliveryAt:new Date(fixture.deliveryAt),deliveryLocation:'Synthetic Tunis',status:'ACCEPTED',quoteMillimes:1000n,order:{create:{status:'SETTLED',delivered:1}}},include:{order:true}});
  const offer=await db.commercialOffer.create({data:{orderId:legacy.order.id,capacityDeclarationId:fixture.capacityDeclarationId,artisanProfileId:fixture.artisanProfileId,quantity:1,unitPayMillimes:1000n,estimatedHours:'1',expiresAt:new Date(fixture.offerExpiresAt),materials:'Synthetic only',reworkTerms:'Reviewed',paymentConditions:'Synthetic',status:'ACCEPTED',batch:{create:{orderId:legacy.order.id,artisanProfileId:fixture.artisanProfileId,status:'COMPLETED',produced:1,submitted:1,approved:1}}},include:{batch:true}});
  await db.syntheticPayment.createMany({data:[{orderId:legacy.order.id,kind:'BUYER_RECEIPT',amountMillimes:1000n,status:'SETTLED',evidenceType:'SIMULATED_SETTLEMENT'},{orderId:legacy.order.id,batchId:offer.batch.id,kind:'ARTISAN_PAYOUT',amountMillimes:1000n,status:'SETTLED',evidenceType:'SIMULATED_SETTLEMENT'}]});
  const adjustment=await db.financialAdjustment.create({data:{orderId:legacy.order.id,amountMillimes:1000n,kind:'PARTIAL_FULFILLMENT',reason:'Unresolved compensation adjustment',makerId:sales.me.user.id,evidence:'Independent evidence',snapshot:{provenance:'SYNTHETIC'}}});
  const assessment=await sales.client.request(`/api/v1/finance/orders/${legacy.order.id}/closure`);assert.equal(assessment.status,200);assert.ok(assessment.body.blockers.includes('SETTLEMENT_POLICY_REVIEW_REQUIRED'));
  const closed=await send(sales,`commerce/orders/${legacy.order.id}/actions`,{next:'CLOSED',version:1,materialsResolved:true,dispositionNote:'Synthetic disposition does not resolve the adjustment'});
  record('LEGACY_ADJUSTMENT_CLOSE',{required:'DENY_UNRESOLVED_FINANCIAL_ADJUSTMENT',actualStatus:closed.status,actualCode:closed.body.code??'CLOSED',adjustmentStatus:adjustment.status,assessmentBlockers:assessment.body.blockers});assert.equal(closed.status,201,'Reproduction changed; inspect result');
 });
 await check('AUDIT retention administrator cannot enable destructive purge',async()=>{
  await db.user.update({where:{id:stranger.me.user.id},data:{role:'ADMIN'}});
  const inv=await stranger.client.request('/api/v1/governance/retention');assert.equal(inv.status,200);assert.equal(inv.body.purgeEnabled,false);
  const result=await send(stranger,'governance/retention/review',{version:inv.body.version,purpose:'Independent policy verification',reason:'Pending policy is not legal approval',purgeEnabled:true});assert.equal(result.status,400);record('RETENTION_NO_PURGE',{outcome:'PASS'});
 });
 await check('AUDIT independent encrypted backup restores source rows and native constraints',async()=>{
  assert.match(database.containerName,/^nasj-test-[a-f0-9]{16}$/);
  const target=await disposableDatabase({foundationOnly:true});const directory=await mkdtemp(join(tmpdir(),'nasj-audit-restore-'));try{
   const key=randomBytes(32);await writeFile(join(directory,'key'),key,{mode:0o600});
   await exec('pnpm',['exec','tsx','scripts/backup-database.ts'],{cwd:process.cwd(),env:{...process.env,BACKUP_CONTAINER:database.containerName,BACKUP_DATABASE:'foundation_test',BACKUP_USER:'foundation_test',BACKUP_DIRECTORY:directory,BACKUP_KEY_FILE:join(directory,'key')},maxBuffer:1024*1024});
   const {readdir}=await import('node:fs/promises');const filename=(await readdir(directory)).find(v=>v.endsWith('.hcab'))!;const encrypted=await readFile(join(directory,filename));assert.ok(encrypted.length>0);const plain=decryptBackup(encrypted,key);let archive:Buffer;try{archive=unpackDatabaseBackup(plain).database;}catch{archive=plain;}
   assert.equal(archive.subarray(0,5).toString(),'PGDMP');assert.throws(()=>decryptBackup(encrypted,randomBytes(32)));const bad=Buffer.from(encrypted);bad[bad.length-1]^=1;assert.throws(()=>decryptBackup(bad,key));
   const file=join(directory,'restore.dump');await writeFile(file,archive,{mode:0o600});await exec('docker',['--context','default','cp',file,`${target.containerName}:/tmp/audit.dump`]);await exec('docker',['--context','default','exec',target.containerName,'pg_restore','-U','foundation_test','-d','foundation_test','--clean','--if-exists','--exit-on-error','/tmp/audit.dump'],{maxBuffer:4*1024*1024});
   const query=async(name:string,sql:string)=>{const r=await exec('docker',['--context','default','exec',name,'psql','-U','foundation_test','-d','foundation_test','-At','-c',sql],{maxBuffer:8*1024*1024});return r.stdout.trim();};
   const tableNames=(await query(database.containerName,"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).split('\n');const snapshots=[];
   for(const name of tableNames){const escaped=name.replaceAll('"','""');const sql=`SELECT coalesce(jsonb_agg(rowdata ORDER BY rowdata::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(t) AS rowdata FROM "${escaped}" t) x`;const src=await query(database.containerName,sql),dst=await query(target.containerName,sql);assert.equal(createHash('sha256').update(src).digest('hex'),createHash('sha256').update(dst).digest('hex'),name);snapshots.push({table:name,rows:JSON.parse(src).length,sha256:createHash('sha256').update(src).digest('hex')});}
   const constraints="SELECT conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1";const sourceConstraints=await query(database.containerName,constraints),targetConstraints=await query(target.containerName,constraints);await writeFile(join(path,'source-constraints.txt'),sourceConstraints);await writeFile(join(path,'restored-constraints.txt'),targetConstraints);const normalize=(s:string)=>s.replace('CHECK ((((quantity >= 1) AND (quantity <= 1000000)) AND','CHECK (((quantity >= 1) AND (quantity <= 1000000) AND').split('\n').sort().join('\n');assert.equal(normalize(sourceConstraints),normalize(targetConstraints));record('RESTORE_INDEPENDENT',{outcome:'PASS',encryptedBytes:encrypted.length,tables:snapshots.length,rows:snapshots.reduce((n,v)=>n+v.rows,0),snapshots});
  }finally{await target.stop();await rm(directory,{recursive:true,force:true});}
 });
 await writeFile(join(path,'independent-results.json'),JSON.stringify(records,null,2)+'\n');
}
