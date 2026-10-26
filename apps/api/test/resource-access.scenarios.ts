import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import { scopeMap } from '../src/modules/artisans/artisan.projection.js';
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
// E01-11 negative suite. Every denial is checked three ways: the expected status (404 outside
// the perimeter, 403 inside it without the permission), a response with no protected data, and a
// database that did not change. Data is synthetic and created directly so each case is isolated.
export async function runResourceAccessScenarios({ db, register, check }: Harness) {
  const user = (label: string) => register(`access-${label}@example.com`, `Synthetic ${label}`);
  const [
    buyerA,
    buyerB,
    operator,
    quality,
    artisanA,
    artisanB,
    coordinator,
    strangerCoordinator,
    admin,
  ] = await Promise.all(
    [
      'buyer-a',
      'buyer-b',
      'operator',
      'quality',
      'artisan-a',
      'artisan-b',
      'coordinator',
      'stranger-coordinator',
      'admin',
    ].map(user),
  );
  await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyerA.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisanA.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: buyerB.me.user.id,
    },
    'access',
  );
  const profileB = await db.artisanProfile.create({
    data: {
      userId: artisanB.me.user.id,
      displayName: 'Synthetic Artisan B access',
      region: 'Tunis',
      equipment: [],
      skills: { create: { craftSkillId: 'weaving' } },
    },
  });
  await db.consentRecord.create({
    data: {
      userId: artisanB.me.user.id,
      purpose: 'artisan.profile',
      decision: true,
      policyVersion: 'artisan-profile-v1',
      collectionContext: 'synthetic_test_fixture',
    },
  });
  const capacityB = await db.capacityDeclaration.create({
    data: {
      artisanProfileId: profileB.id,
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      quantity: '10',
      effectiveFrom: new Date(Date.now() - 86400000),
      effectiveTo: new Date(Date.now() + 8 * 86400000),
      declaredByUserId: artisanB.me.user.id,
    },
  });
  async function chain(
    label: string,
    buyerOrganizationId: string,
    artisanProfileId: string,
    capacityDeclarationId: string,
    amount: number,
  ) {
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId,
        operatorOrganizationId: fixture.operatorOrganizationId,
        craftSkillId: 'weaving',
        title: `Protected title ${label}`,
        specification: `Protected specification ${label}`,
        designRequirements: 'Synthetic design',
        quantity: 10,
        deliveryAt: new Date(fixture.deliveryAt),
        deliveryLocation: 'Synthetic Tunis collection point',
        status: 'ACCEPTED',
        quoteMillimes: BigInt(amount),
      },
    });
    const order = await db.commercialOrder.create({ data: { rfqId: rfq.id } });
    const offer = await db.commercialOffer.create({
      data: {
        orderId: order.id,
        capacityDeclarationId,
        artisanProfileId,
        quantity: 10,
        unitPayMillimes: BigInt(amount + 1),
        estimatedHours: '5',
        expiresAt: new Date(Date.now() + 86400000),
        materials: 'Synthetic materials',
        reworkTerms: 'Synthetic rework terms',
        paymentConditions: 'Synthetic conditions',
        status: 'ACCEPTED',
      },
    });
    const batch = await db.commercialBatch.create({
      data: { orderId: order.id, offerId: offer.id, artisanProfileId },
    });
    const receipt = await db.syntheticPayment.create({
      data: { orderId: order.id, kind: 'BUYER_RECEIPT', amountMillimes: BigInt(amount + 2) },
    });
    const payout = await db.syntheticPayment.create({
      data: {
        orderId: order.id,
        batchId: batch.id,
        kind: 'ARTISAN_PAYOUT',
        amountMillimes: BigInt(amount + 3),
      },
    });
    const attachment = await db.procurementAttachment.create({
      data: {
        rfqId: rfq.id,
        authorId: operator.me.user.id,
        filename: `protected-${label}.webp`,
        mime: 'image/webp',
        bytes: Buffer.from(`protected-${label}`),
        sha256: `sha-${label}`,
      },
    });
    const document = await db.procurementDocument.create({
      data: {
        rfqId: rfq.id,
        orderId: order.id,
        authorId: operator.me.user.id,
        kind: 'QUOTE',
        version: 1,
        content: { note: `protected document ${label}` },
      },
    });
    return { rfq, order, offer, batch, receipt, payout, attachment, document, amount };
  }
  const A = await chain(
    'A-1111',
    fixture.buyerOrganizationId,
    fixture.artisanProfileId,
    fixture.capacityDeclarationId,
    111100000,
  );
  const B = await chain(
    'B-2222',
    fixture.otherBuyerOrganizationId,
    profileB.id,
    capacityB.id,
    222200000,
  );
  // Values that must never appear in a denied response about B.
  const secretsB = [
    'Protected title B-2222',
    'Protected specification B-2222',
    'protected document B-2222',
    String(B.amount),
    String(B.amount + 1),
    String(B.amount + 2),
    String(B.amount + 3),
    B.rfq.id,
    B.order.id,
  ];

  const text = (value: unknown) =>
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  async function send(who: Identity, path: string, method = 'GET', body?: unknown) {
    if (method === 'GET') return who.client.request(path);
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(path, method, body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': randomUUID(),
    });
  }
  async function dbState(chainRows: typeof B) {
    return text(
      await Promise.all([
        db.commercialRfq.findUnique({ where: { id: chainRows.rfq.id } }),
        db.commercialOrder.findUnique({ where: { id: chainRows.order.id } }),
        db.commercialOffer.findUnique({ where: { id: chainRows.offer.id } }),
        db.commercialBatch.findUnique({ where: { id: chainRows.batch.id } }),
        db.syntheticPayment.findMany({
          where: { orderId: chainRows.order.id },
          orderBy: { id: 'asc' },
        }),
        db.procurementAttachment.count({ where: { rfqId: chainRows.rfq.id, removedAt: null } }),
        db.commercialInspection.count({ where: { batchId: chainRows.batch.id } }),
        db.auditEvent.count({
          where: {
            targetId: {
              in: [chainRows.rfq.id, chainRows.order.id, chainRows.offer.id, chainRows.batch.id],
            },
          },
        }),
        db.outboxEvent.count({
          where: {
            targetId: {
              in: [chainRows.rfq.id, chainRows.order.id, chainRows.offer.id, chainRows.batch.id],
            },
          },
        }),
      ]),
    );
  }
  // One denied request: expected status, uniform body, nothing protected, nothing changed.
  async function denied(
    who: Identity,
    path: string,
    method: string,
    body: unknown,
    status: number,
    secrets: string[] = secretsB,
  ) {
    const before = await dbState(B);
    const result = await send(who, path, method, body);
    assert.equal(
      result.status,
      status,
      `${method} ${path} -> ${result.status} ${text(result.body)}`,
    );
    const reply = text(result.body);
    for (const secret of secrets)
      assert.equal(reply.includes(secret), false, `${path} leaked ${secret}`);
    assert.equal(await dbState(B), before, `${method} ${path} changed the database`);
    return result;
  }
  // Values the RFQ schema already accepts, so a denial can only come from authorization.
  const edit = {
    title: 'Synthetic reconciled craft request',
    specification: 'Ten synthetic woven samples, agreed size and color.',
    designRequirements: 'Fictional blue sample design',
    craftSkillId: 'weaving',
    quantity: 10,
    deliveryAt: fixture.deliveryAt,
    deliveryLocation: 'Synthetic Tunis collection point',
  };
  const api = '/api/v1/commerce';
  const procurement = '/api/v1/procurement';

  await check('E01-11 lists only return rows inside the caller perimeter', async () => {
    const seen = async (who: Identity) => text((await send(who, `${api}/workspace`)).body);
    const a = await seen(buyerA);
    assert.ok(a.includes(A.rfq.id) && a.includes(A.order.id) && a.includes(A.receipt.id));
    for (const hidden of [B.rfq.id, B.order.id, B.receipt.id, B.payout.id, A.offer.id, A.payout.id])
      assert.equal(a.includes(hidden), false, `buyer A list leaked ${hidden}`);
    const b = await seen(artisanA);
    assert.ok(b.includes(A.offer.id) && b.includes(A.batch.id) && b.includes(A.payout.id));
    for (const hidden of [B.offer.id, B.batch.id, B.payout.id, A.receipt.id, A.rfq.id])
      assert.equal(b.includes(hidden), false, `artisan A list leaked ${hidden}`);
    const q = await seen(quality);
    assert.ok(q.includes(A.batch.id) && q.includes(B.batch.id));
    for (const hidden of [A.payout.id, B.payout.id, A.receipt.id, B.receipt.id])
      assert.equal(q.includes(hidden), false, `quality list leaked payment ${hidden}`);
    const o = await seen(operator);
    for (const visible of [A.order.id, B.order.id, A.payout.id, B.receipt.id])
      assert.ok(o.includes(visible));
    const adminList = await seen(admin);
    for (const hidden of [A.rfq.id, B.rfq.id, A.order.id, B.order.id, A.payout.id])
      assert.equal(adminList.includes(hidden), false, 'admin list leaked commerce data');
  });

  await check(
    'E01-11 scenario 1: a buyer cannot reach another buyer RFQ (read, list, mutation, attachment)',
    async () => {
      await denied(buyerA, `${procurement}/rfqs/${B.rfq.id}`, 'GET', undefined, 404);
      await denied(
        buyerA,
        `${api}/rfqs/${B.rfq.id}/actions`,
        'POST',
        { version: 1, next: 'SUBMITTED' },
        404,
      );
      await denied(buyerA, `${api}/rfqs/${B.rfq.id}`, 'PATCH', { ...edit, version: 1 }, 404);
      await denied(
        buyerA,
        `${procurement}/rfqs/${B.rfq.id}/attachments/${B.attachment.id}/token`,
        'GET',
        undefined,
        404,
      );
      await denied(
        buyerA,
        `${procurement}/rfqs/${B.rfq.id}/attachments/${B.attachment.id}/content?token=invalid-token`,
        'GET',
        undefined,
        404,
      );
      await denied(
        buyerA,
        `${procurement}/documents/${B.document.id}/download`,
        'GET',
        undefined,
        404,
      );
      await denied(buyerA, `${api}/orders/${B.order.id}/report`, 'GET', undefined, 404);
      await denied(buyerA, `${api}/orders/${B.order.id}/report.csv`, 'GET', undefined, 404);
      // Inside the perimeter but without the role: the buyer may see its own order and still not act as finance.
      const own = await send(buyerA, `${api}/orders/${A.order.id}/actions`, 'POST', {
        version: 1,
        next: 'FUNDING_CONFIRMED',
      });
      assert.equal(own.status, 403);
    },
  );

  await check(
    'E01-11 scenario 2: an artisan cannot reach another artisan payment, batch or offer',
    async () => {
      await denied(
        artisanA,
        `${api}/payments/${B.payout.id}/actions`,
        'POST',
        { version: 1, next: 'APPROVED' },
        404,
      );
      await denied(
        artisanA,
        `${api}/batches/${B.batch.id}/progress`,
        'POST',
        { version: 1, produced: 5 },
        404,
      );
      await denied(
        artisanA,
        `${api}/batches/${B.batch.id}/actions`,
        'POST',
        { version: 1, next: 'IN_PROGRESS' },
        404,
      );
      await denied(
        artisanA,
        `${api}/offers/${B.offer.id}/actions`,
        'POST',
        { version: 1, next: 'DECLINED' },
        404,
      );
      await denied(artisanA, `${api}/orders/${B.order.id}/report`, 'GET', undefined, 404);
      // The artisan owns payout A but may not drive finance transitions on it: inside the perimeter, 403.
      const ownPayout = await send(artisanA, `${api}/payments/${A.payout.id}/actions`, 'POST', {
        version: 1,
        next: 'APPROVED',
      });
      assert.equal(ownPayout.status, 403);
    },
  );

  await check(
    'E01-11 ID substitution: swapping in another organization identifier is refused',
    async () => {
      // Own RFQ id with the other RFQ attachment, and the reverse.
      await denied(
        buyerA,
        `${procurement}/rfqs/${A.rfq.id}/attachments/${B.attachment.id}/token`,
        'GET',
        undefined,
        404,
      );
      await denied(
        buyerB,
        `${procurement}/rfqs/${B.rfq.id}/attachments/${A.attachment.id}/token`,
        'GET',
        undefined,
        404,
      );
      // Creating records against another organization order.
      await denied(
        buyerA,
        `${api}/payments`,
        'POST',
        { orderId: B.order.id, kind: 'BUYER_RECEIPT', amountTnd: '0.001', provenance: 'SYNTHETIC' },
        404,
      );
      await denied(
        operator,
        `${api}/payments`,
        'POST',
        {
          orderId: randomUUID(),
          kind: 'BUYER_RECEIPT',
          amountTnd: '0.001',
          provenance: 'SYNTHETIC',
        },
        404,
        [],
      );
      // A buyer cannot file an RFQ under an organization it does not belong to.
      const filed = await send(buyerA, `${api}/rfqs`, 'POST', {
        buyerOrganizationId: fixture.otherBuyerOrganizationId,
        operatorOrganizationId: fixture.operatorOrganizationId,
        ...edit,
        title: 'Substituted organization',
        provenance: 'SYNTHETIC',
      });
      assert.equal(filed.status, 403);
      assert.equal(
        await db.commercialRfq.count({ where: { title: 'Substituted organization' } }),
        0,
      );
    },
  );

  await check(
    'E01-11 a denial is indistinguishable from a resource that does not exist',
    async () => {
      const missing = randomUUID();
      const pairs: [Identity, string, string, unknown][] = [
        [buyerA, `${procurement}/rfqs/ID`, 'GET', undefined],
        [buyerA, `${api}/orders/ID/report`, 'GET', undefined],
        [buyerA, `${api}/rfqs/ID/actions`, 'POST', { version: 1, next: 'SUBMITTED' }],
        [artisanA, `${api}/payments/ID/actions`, 'POST', { version: 1, next: 'APPROVED' }],
        [artisanA, `${api}/batches/ID/progress`, 'POST', { version: 1, produced: 5 }],
        [artisanA, `${api}/offers/ID/actions`, 'POST', { version: 1, next: 'DECLINED' }],
        [buyerA, `${procurement}/documents/ID/download`, 'GET', undefined],
      ];
      const real = (path: string) =>
        path
          .replace('rfqs/ID', `rfqs/${B.rfq.id}`)
          .replace('orders/ID', `orders/${B.order.id}`)
          .replace('payments/ID', `payments/${B.payout.id}`)
          .replace('batches/ID', `batches/${B.batch.id}`)
          .replace('offers/ID', `offers/${B.offer.id}`)
          .replace('documents/ID', `documents/${B.document.id}`);
      for (const [who, path, method, body] of pairs) {
        const existing = await send(who, real(path), method, body);
        const absent = await send(who, path.replace('ID', missing), method, body);
        assert.equal(existing.status, 404, path);
        assert.equal(absent.status, 404, path);
        const a = existing.body as { code?: string; message?: string };
        const b = absent.body as { code?: string; message?: string };
        assert.equal(a.code, b.code, path);
        assert.equal(a.message, b.message, path);
      }
    },
  );

  // ---- Artisan profile: delegation (scenario 3 and revoked / expired delegations) ----
  const association = await db.organization.create({
    data: {
      name: 'Synthetic Association access',
      slug: `access-association-${Date.now()}`,
      type: 'ASSOCIATION',
      approvalStatus: 'APPROVED',
      country: 'TN',
      region: 'Tunis',
      description: 'Synthetic E01-11 association',
      contactEmail: 'synthetic-access@example.com',
      representativeName: 'Synthetic reviewer',
      createdByUserId: coordinator.me.user.id,
    },
  });
  for (const member of [coordinator, strangerCoordinator])
    await db.organizationMember.create({
      data: {
        organizationId: association.id,
        userId: member.me.user.id,
        roles: {
          create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinator.me.user.id },
        },
      },
    });
  const link = await db.consentRecord.create({
    data: {
      userId: artisanA.me.user.id,
      purpose: `association:${association.id}`,
      decision: true,
      policyVersion: 'association-v1',
      collectionContext: 'synthetic_test_fixture',
    },
  });
  await db.associationMembership.create({
    data: {
      artisanProfileId: fixture.artisanProfileId,
      organizationId: association.id,
      consentRecordId: link.id,
    },
  });
  const grant = await db.delegationGrant.create({
    data: {
      artisanProfileId: fixture.artisanProfileId,
      delegateUserId: coordinator.me.user.id,
      organizationId: association.id,
      scopes: [scopeMap['artisan.profile.read'], scopeMap['artisan.skills.manage']],
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.consentRecord.create({
    data: {
      userId: artisanA.me.user.id,
      purpose: `delegation:${grant.id}`,
      decision: true,
      policyVersion: 'delegation-v1',
      collectionContext: 'synthetic_test_fixture',
    },
  });
  const profileUrl = `/api/v1/artisans/${fixture.artisanProfileId}`;
  const profileState = async () =>
    text(
      await db.artisanProfile.findUniqueOrThrow({
        where: { id: fixture.artisanProfileId },
        include: { skills: true },
      }),
    );
  async function profileDenied(who: Identity, label: string) {
    const before = await profileState();
    const read = await send(who, profileUrl);
    const write = await send(who, `${profileUrl}/skills`, 'PUT', { items: [] });
    assert.equal(read.status, 404, `${label}: read`);
    assert.equal(write.status, 404, `${label}: write`);
    assert.equal(
      text(read.body).includes('Synthetic Artisan access'),
      false,
      `${label}: leaked profile`,
    );
    assert.equal(await profileState(), before, `${label}: profile changed`);
  }

  await check(
    'E01-11 scenario 3: an association without a delegation cannot read or update the profile',
    async () => {
      await profileDenied(strangerCoordinator, 'coordinator without delegation');
      await profileDenied(buyerA, 'buyer');
      await profileDenied(admin, 'platform admin');
      await profileDenied(artisanB, 'other artisan');
      // Positive control: the same coordinator with a valid delegation can read, so the denials above are meaningful.
      assert.equal((await send(coordinator, profileUrl)).status, 200);
    },
  );

  await check('E01-11 a revoked or expired delegation removes access immediately', async () => {
    await db.delegationGrant.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await profileDenied(coordinator, 'expired delegation');
    await db.delegationGrant.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() + 86400000), revokedAt: new Date() },
    });
    await profileDenied(coordinator, 'revoked delegation');
    await db.delegationGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
    assert.equal((await send(coordinator, profileUrl)).status, 200);
    await db.associationMembership.updateMany({
      where: { artisanProfileId: fixture.artisanProfileId, organizationId: association.id },
      data: { endedAt: new Date() },
    });
    await profileDenied(coordinator, 'ended association relationship');
  });

  await check('E01-11 a role or membership change removes access immediately', async () => {
    const quality404 = async () => {
      assert.equal((await send(quality, `${api}/orders/${A.order.id}/report`)).status, 404);
      assert.equal(
        (
          await send(quality, `${api}/batches/${A.batch.id}/inspections`, 'POST', {
            version: 1,
            approved: 1,
            rejected: 0,
            pending: 9,
          })
        ).status,
        404,
      );
      assert.equal(
        text((await send(quality, `${api}/workspace`)).body).includes(A.batch.id),
        false,
      );
    };
    assert.equal(text((await send(quality, `${api}/workspace`)).body).includes(A.batch.id), true);
    await db.organizationMember.updateMany({
      where: { organizationId: fixture.operatorOrganizationId, userId: quality.me.user.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await quality404();
    // Removing the buyer role (not the membership) is enough to lose the RFQ.
    assert.equal(text((await send(buyerA, `${api}/workspace`)).body).includes(A.rfq.id), true);
    await db.membershipRole.deleteMany({
      where: {
        membership: { organizationId: fixture.buyerOrganizationId, userId: buyerA.me.user.id },
      },
    });
    assert.equal(text((await send(buyerA, `${api}/workspace`)).body).includes(A.rfq.id), false);
    assert.equal((await send(buyerA, `${procurement}/rfqs/${A.rfq.id}`)).status, 404);
    assert.equal((await send(buyerA, `${api}/orders/${A.order.id}/report`)).status, 404);
  });
}
