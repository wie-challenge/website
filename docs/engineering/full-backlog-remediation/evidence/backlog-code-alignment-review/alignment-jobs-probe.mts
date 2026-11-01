import 'reflect-metadata';
import assert from 'node:assert/strict';
import {bootPostgres} from './pg-harness/wire-session.mjs';
import {buildChain} from '/home/ashenix/Projects/wie-challenge/website/apps/api/test/pg-harness/fixture.mjs';
import {PrismaClient} from '@prisma/client';import {PrismaPg} from '@prisma/adapter-pg';
import {dispatchBatch,outboxStatus} from '../src/jobs/outbox.js';import {consumeLocalEvent,rebuildAnalyticsBatch} from '../src/jobs/commerce-consumer.js';
const env=await bootPostgres(),db=new PrismaClient({adapter:new PrismaPg({connectionString:env.connectionString})});
try{
 const c=await buildChain(env.client,'jobs-audit');const before=await db.artisanPayable.count();
 const event=await db.outboxEvent.create({data:{id:'audit-jobs-event',auditEventId:'audit-only-reference',eventType:'commerce.rfq.submitted',actorId:c.userId,organizationId:'wrong-tenant',targetType:'CommercialRfq',targetId:'rfq-jobs-audit-1',correlationId:'synthetic-audit',createdAt:new Date(Date.now()-60000)}});
 await assert.rejects(()=>db.$transaction(tx=>consumeLocalEvent(tx,event)),/Invalid commerce source/);
 const lag=await outboxStatus(db as never);assert(lag.oldestPendingAgeMs>=59000);assert(lag.counts.length>0);
 for(let i=0;i<5;i++){await db.outboxEvent.update({where:{id:event.id},data:{availableAt:new Date(0)}});await dispatchBatch(db as never,1,async()=>{throw new Error('synthetic transient failure')})}
 const dead=await outboxStatus(db as never);assert.equal(dead.failed[0].attempts,5);assert.equal(dead.failed[0].lastErrorCode,'LOCAL_CONSUMER_FAILED');
 await db.outboxEvent.update({where:{id:event.id},data:{organizationId:'buy-jobs-audit-1',status:'RETRY',attempts:0,availableAt:new Date(0)}});await dispatchBatch(db as never,1);assert.equal((await db.outboxEvent.findUniqueOrThrow({where:{id:event.id}})).status,'DELIVERED');
 await rebuildAnalyticsBatch(db as never);assert.equal(await db.artisanPayable.count(),before);assert.equal(await db.eventReceipt.count({where:{eventId:event.id}}),1);
 console.log(JSON.stringify({nativePostgres:true,tenantMismatchRejected:true,lagMilliseconds:lag.oldestPendingAgeMs,failedAttempts:5,errorCodeExposed:true,replayDelivered:true,rebuildPreservesPayables:true,receiptCount:1}));
}finally{await db.$disconnect();await env.close()}
