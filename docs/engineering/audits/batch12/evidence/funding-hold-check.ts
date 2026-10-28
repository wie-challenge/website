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
 const records:any[]=[];const record=(id:string,result:unknown)=>{records.push({id,...result as object});writeFileSync(join(path,'funding-hold-results.json'),JSON.stringify(records,null,2)+'\n');};
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
  ok(await send(sales,`finance/rfqs/${rfq.id}/review`,{quoteId:quote.id,decision:'HOLD',fundingStatus:'UNFUNDED',fundingEvidence:'Explicitly unfunded independent scenario',reason:'Independent finance hold before buyer commitment'}));
  const accepted=await send(buyer,`procurement/rfqs/${rfq.id}/accept`,{version:1,quoteId:quote.id,termsSha256:quote.termsSha256,confirm:true});
  record('FUNDING_HOLD_IGNORED',{required:'DENY_FINANCE_REVIEW_REQUIRED',actualStatus:accepted.status,actualCode:accepted.body.code??'ACCEPTED',reviewCount:1,reviewState:'HOLD_UNFUNDED',orderId:accepted.body.id});assert.equal(accepted.status,201,'Reproduction changed; inspect result');
 });

}
