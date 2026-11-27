import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import { seedCommerceFixture } from './commerce.fixture.js';

type Identity = {
  me: { user: { id: string } };
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; body: unknown }>;
  };
};

/** Runs only in the disposable integration harness with synthetic identities. */
export async function runFinancialPlanScenarios({
  db,
  register,
  check,
}: {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
}) {
  const [buyer, maker, artisan, checker, outsider] = await Promise.all(
    ['buyer', 'maker', 'artisan', 'checker', 'outsider'].map((role) =>
      register(`financial-plan-${role}@example.com`, `Synthetic plan ${role}`),
    ),
  );
  await db.craftSkill.upsert({
    where: { id: 'weaving' },
    create: { id: 'weaving', name: 'Weaving', category: 'TEXTILE' },
    update: {},
  });
  const f = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: maker.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: checker.me.user.id,
      outsiderId: outsider.me.user.id,
    },
    'financial-plan',
  );
  const checkerMembership = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: f.operatorOrganizationId,
        userId: checker.me.user.id,
      },
    },
  });
  const makerMembership = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: { organizationId: f.operatorOrganizationId, userId: maker.me.user.id },
    },
  });
  await db.membershipRole.create({
    data: {
      membershipId: checkerMembership.id,
      role: 'FINANCE_MANAGER',
      assignedByUserId: maker.me.user.id,
    },
  });
  for (const [person, membership] of [
    [maker, makerMembership],
    [checker, checkerMembership],
  ] as const) {
    await db.operatorAssignment.create({
      data: {
        operatorId: person.me.user.id,
        organizationId: f.buyerOrganizationId,
        assignedById: maker.me.user.id,
      },
    });
    await db.membershipPermission.createMany({
      data: ['finance.payable.reconcile', 'finance.payout.approve'].map((permission) => ({
        membershipId: membership.id,
        permission,
        grantedById: maker.me.user.id,
        reason: 'Synthetic financial plan authority',
      })),
    });
  }
  const rfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: f.buyerOrganizationId,
      operatorOrganizationId: f.operatorOrganizationId,
      craftSkillId: 'weaving',
      title: 'Synthetic plan',
      specification: 'Synthetic specification',
      designRequirements: 'Synthetic requirements',
      quantity: 1,
      deliveryAt: new Date(f.deliveryAt),
      deliveryLocation: 'Synthetic Tunis',
      status: 'ACCEPTED',
      procurementManaged: true,
      order: { create: { status: 'APPROVED' } },
    },
    include: { order: true },
  });
  const orderId = rfq.order!.id;
  const revision = await db.procurementRevision.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      authorId: maker.me.user.id,
      reason: 'Synthetic terms',
      snapshot: {},
    },
  });
  const assessment = await db.feasibilityAssessment.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      rfqVersion: 1,
      result: 'FEASIBLE',
      unitType: 'PIECES',
      requestedQuantity: 1,
      constraints: [],
      explanation: 'Synthetic',
      assumptions: {},
      authorId: maker.me.user.id,
    },
  });
  const cost = await db.costEstimate.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      feasibilityAssessmentId: assessment.id,
      quantity: 1,
      components: [
        { category: 'MATERIALS', amountTnd: '100.000' },
        { category: 'ARTISAN_LABOR', amountTnd: '600.000' },
      ],
      subtotalMillimes: 700000n,
      marginMethod: 'NONE',
      marginBasisPoints: 0,
      sellingMillimes: 2000000n,
      incomplete: false,
      status: 'APPROVED',
      authorId: maker.me.user.id,
      snapshot: {},
    },
  });
  await db.procurementQuote.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      revisionId: revision.id,
      authorId: maker.me.user.id,
      totalMillimes: 2000000n,
      expiresAt: new Date(f.quoteExpiresAt),
      snapshot: {},
      feasibilityAssessmentId: assessment.id,
      costEstimateId: cost.id,
      termsSha256: 'ab'.repeat(32),
      acceptance: { create: { orderId, actorId: buyer.me.user.id, snapshot: {} } },
    },
  });
  const path = `/api/v1/finance/orders/${orderId}/financial-plan-drafts`;
  const draftInput = {
    basis: 'GROSS',
    expectedFeeTnd: '50.000',
    artisans: [{ artisanId: f.artisanProfileId, basisPoints: 3000 }],
    reason: 'Synthetic allocation',
  };
  async function send(person: Identity, target: string, body: unknown, key = randomUUID()) {
    const me = await person.client.request('/api/v1/me');
    return person.client.request(target, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  await check(
    'financial plan API authorizes, freezes accepted quote costs and deduplicates commands',
    async () => {
      assert.equal((await send(outsider, path, draftInput)).status, 404);
      const key = randomUUID();
      const draft = await send(maker, path, draftInput, key);
      assert.equal(draft.status, 201, JSON.stringify(draft.body));
      assert.deepEqual((await send(maker, path, draftInput, key)).body, draft.body);
      const plan = draft.body as {
        id: string;
        allocation: {
          baseMillimes: string;
          directCostsMillimes: string;
          artisans: { amountMillimes: string }[];
        };
      };
      assert.equal(plan.allocation.baseMillimes, '2000000');
      assert.equal(plan.allocation.directCostsMillimes, '100000');
      assert.equal(plan.allocation.artisans[0].amountMillimes, '600000');
      const storedDraft = await db.financeRecordEvent.findUniqueOrThrow({ where: { id: plan.id } });
      const staleData = structuredClone(storedDraft.data) as Record<string, unknown>;
      staleData.termsSha256 = 'cd'.repeat(32);
      const staleDraft = await db.financeRecordEvent.create({
        data: {
          orderId,
          targetId: orderId,
          targetType: 'FinancialPlanDraft',
          actorId: maker.me.user.id,
          status: 'DRAFT',
          reason: 'Synthetic stale evidence',
          data: staleData as never,
        },
      });
      const staleResult = await send(checker, `${path}/${staleDraft.id}/approve`, {
        reason: 'Review stale draft',
      });
      assert.equal(staleResult.status, 409, JSON.stringify(staleResult.body));
      assert.equal((staleResult.body as { code: string }).code, 'FINANCIAL_PLAN_STALE');
      const approve = `${path}/${plan.id}/approve`;
      assert.notEqual((await send(maker, approve, { reason: 'Self approval' })).status, 201);
      assert.equal((await send(outsider, approve, { reason: 'Unauthorized' })).status, 404);
      const approvalKey = randomUUID();
      const approved = await send(
        checker,
        approve,
        { reason: 'Independent approval' },
        approvalKey,
      );
      assert.equal(approved.status, 201, JSON.stringify(approved.body));
      assert.deepEqual(
        (await send(checker, approve, { reason: 'Independent approval' }, approvalKey)).body,
        approved.body,
      );
      assert.equal((await send(checker, approve, { reason: 'Duplicate approval' })).status, 409);
      assert.equal(await db.financialPlanSnapshot.count({ where: { acceptance: { orderId } } }), 1);
    },
  );
}
