import 'reflect-metadata';
import assert from 'node:assert/strict';
import { disposableDatabase } from './support.js';
import { buildChain } from '/home/ashenix/Projects/wie-challenge/website/apps/api/test/pg-harness/fixture.mjs';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { commitmentDenials, requireCurrentEligibility } from '../src/modules/procurement/eligibility-guard.js';
const env=await disposableDatabase();const raw=new Client({connectionString:env.url});await raw.connect();const db=new PrismaClient({adapter:new PrismaPg({connectionString:env.url})});
try {
 const c=await buildChain(raw,'alignment');
 await db.consentRecord.create({data:{userId:c.userId,purpose:'artisan.profile',policyVersion:'audit-v1',decision:true,collectionContext:'Synthetic audit fixture'}});
 const other=await db.craftSkill.create({data:{name:'Synthetic unrelated craft',category:'TEXTILE'}});
 await db.artisanSkill.create({data:{artisanProfileId:c.artisanProfileId,craftSkillId:other.id}});
 const cap=await db.capacityDeclaration.findFirstOrThrow({where:{artisanProfileId:c.artisanProfileId}});
 const input={artisanProfileId:c.artisanProfileId,userId:c.userId,orderId:c.orderId,craftSkillId:c.craftId,capacityDeclarationId:cap.id,quantity:10,periodFrom:cap.effectiveFrom,periodTo:cap.effectiveTo};
 const d=await commitmentDenials(db as never,input);assert.equal(d.some(x=>x.code==='CRAFT_MISMATCH'),false);
 console.log(JSON.stringify({case:'requested craft removed; unrelated craft retained',denials:d,craftMismatchDenied:false,classification:'COUNTEREXAMPLE_CONFIRMED'}));
 await db.capacityDeclaration.update({where:{id:cap.id},data:{quantity:100}});
 await db.commercialOffer.update({where:{id:c.offerId},data:{status:'OFFERED'}});
 const own=await commitmentDenials(db as never,{...input,quantity:100});assert(own.some(x=>x.code==='CAPACITY_EXCEEDED'));console.log(JSON.stringify({case:'full own offered reservation counted twice',denials:own,classification:'COUNTEREXAMPLE_CONFIRMED'}));
 await db.artisanProfile.update({where:{id:c.artisanProfileId},data:{availabilityStatus:'PAUSED'}});
 await assert.rejects(()=>requireCurrentEligibility(db as never,input),e=>JSON.stringify(e).includes('AVAILABILITY_PAUSED'));
 console.log(JSON.stringify({case:'current pause',denied:true}));
 const a=new Client({connectionString:env.url}),b=new Client({connectionString:env.url});await a.connect();await b.connect();
 const ids=await Promise.all([a.query('select pg_backend_pid() id'),b.query('select pg_backend_pid() id')]);assert.notEqual(ids[0].rows[0].id,ids[1].rows[0].id);
 await a.query('begin');await a.query('select pg_advisory_xact_lock(7391)');await b.query('begin');const r=await b.query('select pg_try_advisory_xact_lock(7391) acquired');assert.equal(r.rows[0].acquired,false);await a.query('rollback');await b.query('rollback');await a.end();await b.end();console.log(JSON.stringify({case:'genuine multi-connection PostgreSQL',distinctBackendIds:true,competingLockBlocked:true}));
} finally {await db.$disconnect();await raw.end();await env.stop()}
