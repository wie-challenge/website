import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { CommerceWorkspaceView } from '@hirfacare/contracts';
import { seedCommerceFixture } from './commerce.fixture.js';
type Result = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<Result>;
};
type Identity = { client: Client; me: { user: { id: string } } };
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
export async function runCommerceScenarios({ db, register, check }: Harness) {
  const buyer = await register('commerce-buyer@example.com', 'Synthetic Commerce Buyer');
  const operator = await register('commerce-operator@example.com', 'Synthetic Commerce Operator');
  const artisan = await register('commerce-artisan@example.com', 'Synthetic Commerce Artisan');
  const quality = await register('commerce-quality@example.com', 'Synthetic Quality Inspector');
  const outsider = await register('commerce-outsider@example.com', 'Unrelated Commerce Buyer');
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: outsider.me.user.id,
    },
    'integration',
  );
  async function command(
    who: Identity,
    path: string,
    body: unknown,
    key: string = randomUUID(),
    method = 'POST',
  ) {
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(`/api/v1/commerce/${path}`, method, body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function ok(who: Identity, path: string, body: unknown, key?: string) {
    const result = await command(who, path, body, key);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body as { id: string; version: number };
  }
  async function workspace(who: Identity) {
    const result = await who.client.request('/api/v1/commerce/workspace');
    assert.equal(result.status, 200);
    return result.body as CommerceWorkspaceView;
  }
  const input = {
    buyerOrganizationId: fixture.buyerOrganizationId,
    operatorOrganizationId: fixture.operatorOrganizationId,
    craftSkillId: 'weaving',
    title: 'Synthetic reconciled craft request',
    specification: 'Ten synthetic woven samples, agreed size and color.',
    designRequirements: 'Fictional blue sample design',
    quantity: 10,
    deliveryAt: fixture.deliveryAt,
    deliveryLocation: 'Synthetic Tunis collection point',
    provenance: 'SYNTHETIC',
  };
  let rfqId = '',
    orderId = '',
    offerId = '',
    batchId = '';
  async function rfqAction(who: Identity, next: string, extra: object = {}) {
    const row = await db.commercialRfq.findUniqueOrThrow({ where: { id: rfqId } });
    return ok(who, `rfqs/${rfqId}/actions`, { version: row.version, next, ...extra });
  }
  async function orderAction(who: Identity, next: string, extra: object = {}) {
    const row = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
    return ok(who, `orders/${orderId}/actions`, { version: row.version, next, ...extra });
  }
  async function batchAction(who: Identity, next: string, extra: object = {}) {
    const row = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
    return ok(who, `batches/${batchId}/actions`, { version: row.version, next, ...extra });
  }
  async function settle(id: string) {
    for (const next of ['APPROVED', 'INITIATED', 'SETTLED']) {
      const row = await db.syntheticPayment.findUniqueOrThrow({ where: { id } });
      await ok(operator, `payments/${id}/actions`, {
        version: row.version,
        next,
        ...(next === 'SETTLED' ? { evidenceType: 'SIMULATED_SETTLEMENT' } : {}),
      });
    }
  }
  await check(
    'commerce draft persistence, tenant privacy, strict validation and concurrent keyed creation',
    async () => {
      const key = randomUUID();
      const results = await Promise.all([
        command(buyer, 'rfqs', input, key),
        command(buyer, 'rfqs', input, key),
      ]);
      for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual(results[0].body, results[1].body);
      rfqId = (results[0].body as { id: string }).id;
      assert.equal(
        await db.commercialRfq.count({
          where: { buyerOrganizationId: fixture.buyerOrganizationId },
        }),
        1,
      );
      assert.equal(
        (await workspace(operator)).rfqs.length,
        0,
        'Unsubmitted buyer drafts are private.',
      );
      assert.equal((await workspace(outsider)).rfqs.length, 0);
      assert.equal((await command(buyer, 'rfqs', { ...input, quantity: 11 }, key)).status, 409);
      for (const body of [
        { ...input, provenance: 'OBSERVED' },
        { ...input, wearableSummary: { strain: 3 } },
        { ...input, quantity: 0 },
        { ...input, quantity: 1.5 },
        { ...input, deliveryAt: '2020-01-01T00:00:00Z' },
      ])
        assert.equal((await command(buyer, 'rfqs', body)).status, 400);
      assert.equal((await command(outsider, 'rfqs', input)).status, 403);
      const row = await db.commercialRfq.findUniqueOrThrow({ where: { id: rfqId } });
      const {
        buyerOrganizationId: _b,
        operatorOrganizationId: _o,
        provenance: _p,
        ...edit
      } = input;
      assert.equal(
        (
          await command(
            outsider,
            `rfqs/${rfqId}`,
            { ...edit, version: row.version },
            undefined,
            'PATCH',
          )
        ).status,
        403,
      );
      const changed = await command(
        buyer,
        `rfqs/${rfqId}`,
        { ...edit, title: 'Reopened synthetic craft request', version: row.version },
        undefined,
        'PATCH',
      );
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal((await workspace(buyer)).rfqs[0].title, 'Reopened synthetic craft request');
      await rfqAction(buyer, 'SUBMITTED');
      assert.equal(
        (await command(buyer, `rfqs/${rfqId}`, { ...edit, version: 3 }, undefined, 'PATCH')).status,
        409,
      );
      assert.equal(
        (await command(buyer, `rfqs/${rfqId}/actions`, { next: 'UNDER_REVIEW', version: 3 }))
          .status,
        403,
      );
    },
  );
  await check(
    'commerce exact quote acceptance creates one order and requires reconciled simulated funding',
    async () => {
      await rfqAction(operator, 'UNDER_REVIEW');
      await rfqAction(operator, 'QUOTED', {
        quoteTnd: '100.001',
        quoteExpiresAt: fixture.quoteExpiresAt,
      });
      const row = await db.commercialRfq.findUniqueOrThrow({ where: { id: rfqId } });
      const key = randomUUID();
      const payload = { next: 'ACCEPTED', version: row.version };
      const results = await Promise.all([
        command(buyer, `rfqs/${rfqId}/actions`, payload, key),
        command(buyer, `rfqs/${rfqId}/actions`, payload, key),
      ]);
      assert.equal(results[0].status, 201);
      assert.deepEqual(results[0].body, results[1].body);
      const order = await db.commercialOrder.findUniqueOrThrow({ where: { rfqId } });
      orderId = order.id;
      assert.equal(
        (
          await command(operator, `orders/${orderId}/actions`, {
            next: 'FUNDING_CONFIRMED',
            version: 1,
          })
        ).status,
        409,
      );
      const payment = await ok(operator, 'payments', {
        orderId,
        kind: 'BUYER_RECEIPT',
        amountTnd: '100.001',
        provenance: 'SYNTHETIC',
      });
      const scheduledOrder = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(
        (
          await command(buyer, `orders/${orderId}/actions`, {
            version: scheduledOrder.version,
            next: 'CANCELLED',
          })
        ).status,
        409,
        'Pending payments must not be hidden by cancellation.',
      );
      assert.equal(
        (
          await command(operator, 'payments', {
            orderId,
            kind: 'BUYER_RECEIPT',
            amountTnd: '0.001',
            provenance: 'SYNTHETIC',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(quality, 'payments', {
            orderId,
            kind: 'BUYER_RECEIPT',
            amountTnd: '1.000',
            provenance: 'SYNTHETIC',
          })
        ).status,
        403,
      );
      await settle(payment.id);
      assert.equal(
        (await db.syntheticPayment.findUniqueOrThrow({ where: { id: payment.id } })).amountMillimes,
        100001n,
      );
      await orderAction(operator, 'FUNDING_CONFIRMED');
      await orderAction(operator, 'PLANNING');
    },
  );
  const offerInput = () => ({
    orderId,
    capacityDeclarationId: fixture.capacityDeclarationId,
    quantity: 10,
    unitPayTnd: '2.345',
    estimatedHours: '2 to 3',
    expiresAt: fixture.offerExpiresAt,
    materials: 'Synthetic operator supplies yarn',
    reworkTerms: 'Rework only with explicit artisan acceptance; no decline penalty',
    paymentConditions: 'Synthetic payable at QA-approved units, independent of buyer delays',
    provenance: 'SYNTHETIC',
  });
  await check(
    'commerce offer reservations reconcile concurrent allocation, decline, expiry and explicit owner acceptance',
    async () => {
      const concurrent = await Promise.all([
        command(operator, 'offers', { ...offerInput(), quantity: 6 }),
        command(operator, 'offers', { ...offerInput(), quantity: 6 }),
      ]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
      const reserved = concurrent.find((r) => r.status === 201)!.body as {
        id: string;
        version: number;
      };
      assert.equal(
        (await command(operator, `offers/${reserved.id}/actions`, { next: 'ACCEPTED', version: 1 }))
          .status,
        403,
      );
      await ok(artisan, `offers/${reserved.id}/actions`, { next: 'DECLINED', version: 1 });
      const expiring = await ok(operator, 'offers', offerInput());
      await db.commercialOffer.update({
        where: { id: expiring.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (await command(artisan, `offers/${expiring.id}/actions`, { next: 'ACCEPTED', version: 1 }))
          .status,
        409,
      );
      await ok(operator, `offers/${expiring.id}/actions`, { next: 'EXPIRED', version: 1 });
      const offer = await ok(operator, 'offers', offerInput());
      offerId = offer.id;
      assert.equal(
        (await command(outsider, `offers/${offerId}/actions`, { next: 'ACCEPTED', version: 1 }))
          .status,
        403,
      );
      const key = randomUUID();
      const decision = { next: 'ACCEPTED', version: 1 };
      const accepted = await Promise.all([
        command(artisan, `offers/${offerId}/actions`, decision, key),
        command(artisan, `offers/${offerId}/actions`, decision, key),
      ]);
      assert.equal(accepted[0].status, 201);
      assert.deepEqual(accepted[0].body, accepted[1].body);
      assert.equal(await db.commercialBatch.count({ where: { offerId } }), 1);
      batchId = (await db.commercialBatch.findUniqueOrThrow({ where: { offerId } })).id;
      assert.equal((await workspace(buyer)).offers.length, 0);
      assert.equal(
        (await workspace(quality)).offers.find((o) => o.id === offerId)!.unitPayTnd,
        null,
      );
      assert.equal((await workspace(artisan)).rfqs.length, 0);
      assert.equal((await workspace(outsider)).orders.length, 0);
      await orderAction(operator, 'IN_PRODUCTION');
      await batchAction(operator, 'MATERIAL_READY');
      await batchAction(artisan, 'IN_PROGRESS');
    },
  );
  await check(
    'commerce cumulative progress, inspection attempts and rework reject excess and preserve quantities',
    async () => {
      const first = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
      const key = randomUUID();
      const payload = { version: first.version, produced: 7 };
      const results = await Promise.all([
        command(artisan, `batches/${batchId}/progress`, payload, key),
        command(artisan, `batches/${batchId}/progress`, payload, key),
      ]);
      assert.equal(results[0].status, 201);
      assert.deepEqual(results[0].body, results[1].body);
      let batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(batch.produced, 7);
      assert.equal(
        (
          await command(artisan, `batches/${batchId}/progress`, {
            version: batch.version,
            produced: 11,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(artisan, `batches/${batchId}/progress`, {
            version: batch.version,
            produced: 6,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(outsider, `batches/${batchId}/progress`, {
            version: batch.version,
            produced: 8,
          })
        ).status,
        403,
      );
      await ok(artisan, `batches/${batchId}/progress`, { version: batch.version, produced: 10 });
      await batchAction(artisan, 'SUBMITTED');
      await orderAction(operator, 'QUALITY_REVIEW');
      const order = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(
        (
          await command(operator, `orders/${orderId}/actions`, {
            next: 'READY_TO_SHIP',
            version: order.version,
          })
        ).status,
        409,
      );
      await batchAction(quality, 'INSPECTION');
      batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(
        (
          await command(quality, `batches/${batchId}/inspections`, {
            version: batch.version,
            approved: 9,
            rejected: 0,
            pending: 0,
          })
        ).status,
        409,
      );
      const inspectKey = randomUUID();
      const inspection = {
        version: batch.version,
        approved: 8,
        rejected: 1,
        pending: 1,
        defectReason: 'Synthetic loose edge',
      };
      await ok(quality, `batches/${batchId}/inspections`, inspection, inspectKey);
      await ok(quality, `batches/${batchId}/inspections`, inspection, inspectKey);
      assert.equal(await db.commercialInspection.count({ where: { batchId } }), 1);
      assert.equal(
        (
          await command(operator, 'payments', {
            orderId,
            batchId,
            kind: 'ARTISAN_PAYOUT',
            amountTnd: '18.761',
            provenance: 'SYNTHETIC',
          })
        ).status,
        409,
      );
      await batchAction(quality, 'REWORK_REQUESTED');
      batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(
        (
          await command(artisan, `batches/${batchId}/actions`, {
            version: batch.version,
            next: 'IN_PROGRESS',
          })
        ).status,
        403,
      );
      await batchAction(artisan, 'IN_PROGRESS', { reworkAccepted: true });
      await batchAction(artisan, 'SUBMITTED');
      await batchAction(quality, 'INSPECTION');
      batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: batchId } });
      await ok(quality, `batches/${batchId}/inspections`, {
        version: batch.version,
        approved: 10,
        rejected: 0,
        pending: 0,
      });
      await batchAction(quality, 'APPROVED');
      await batchAction(operator, 'COMPLETED');
      assert.equal(await db.commercialInspection.count({ where: { batchId } }), 2);
    },
  );
  await check(
    'commerce fulfillment and separate exact synthetic ledgers block unpaid closure and duplicate settlement',
    async () => {
      await orderAction(operator, 'READY_TO_SHIP');
      await orderAction(operator, 'IN_TRANSIT');
      await orderAction(operator, 'DELIVERED');
      await orderAction(buyer, 'BUYER_ACCEPTED');
      let row = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(
        (
          await command(operator, `orders/${orderId}/actions`, {
            version: row.version,
            next: 'SETTLED',
          })
        ).status,
        409,
      );
      const payment = await ok(operator, 'payments', {
        orderId,
        batchId,
        kind: 'ARTISAN_PAYOUT',
        amountTnd: '23.450',
        provenance: 'SYNTHETIC',
      });
      await settle(payment.id);
      assert.equal(
        (await db.syntheticPayment.findUniqueOrThrow({ where: { id: payment.id } })).amountMillimes,
        23450n,
      );
      assert.equal(
        (await workspace(buyer)).payments.every((p) => p.kind === 'BUYER_RECEIPT'),
        true,
      );
      assert.equal(
        (await workspace(artisan)).payments.every((p) => p.kind === 'ARTISAN_PAYOUT'),
        true,
      );
      assert.equal((await workspace(quality)).payments.length, 0);
      row = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      await orderAction(operator, 'SETTLED');
      row = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(
        (
          await command(operator, `orders/${orderId}/actions`, {
            version: row.version,
            next: 'CLOSED',
          })
        ).status,
        400,
      );
      await orderAction(operator, 'CLOSED', {
        materialsResolved: true,
        dispositionNote:
          'Synthetic materials and returns fully reconciled; no outstanding dispositions.',
      });
      const closed = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(closed.status, 'CLOSED');
      assert.equal(closed.delivered, 10);
      assert.equal(
        (
          await command(operator, `orders/${orderId}/actions`, {
            version: closed.version,
            next: 'PLANNING',
          })
        ).status,
        409,
      );
      assert.equal(await db.syntheticPayment.count({ where: { orderId, status: 'SETTLED' } }), 2);
      const audits = await db.auditEvent.findMany({
        where: { organizationId: fixture.buyerOrganizationId, action: { startsWith: 'commerce.' } },
      });
      assert.ok(audits.length > 20);
      assert.equal(
        await db.outboxEvent.count({ where: { auditEventId: { in: audits.map((a) => a.id) } } }),
        audits.length,
      );
    },
  );
}
