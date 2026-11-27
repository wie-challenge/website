import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PaymentProviderRegistry } from '../src/modules/payments/provider.factory.js';
import { WebhooksService } from '../src/modules/payments/webhooks.service.js';
import { seedCommerceFixture } from './commerce.fixture.js';
import { testConfig } from './support.js';

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

export async function runDhmadPaymentScenarios({
  databaseUrl,
  smtpPort,
  check,
}: {
  databaseUrl: string;
  smtpPort: number;
  check(name: string, fn: () => Promise<void>): Promise<void>;
}) {
  const payConfig = testConfig(databaseUrl, smtpPort, {
    RATE_API_MAX: 3000,
    PAYMENTS_ENABLED: 'true',
    PAYMENT_PROVIDER: 'mock',
    DHMAD_ENVIRONMENT: 'sandbox',
    DHMAD_WEBHOOK_SECRET: 'integration_webhook_secret_32chars',
  });

  let payApp: INestApplication | undefined;
  try {
    payApp = await createApp({ config: payConfig });
    await payApp.listen(0, '127.0.0.1');
    const origin = await payApp.getUrl();
    const { PrismaService: PrismaSvc } = await import('../src/database/prisma.service.js');
    const db = payApp.get(PrismaSvc) as PrismaService;
    const registry = payApp.get(PaymentProviderRegistry);
    const webhooks = payApp.get(WebhooksService);
    const mock = registry.getMockForTesting();

    const { createMailClientForLocalPort, registerOnOrigin } = await (async () => {
      // Reuse simple HTTP helper against payApp origin, reading verification tokens from Verification table in DB.
      function makeClient() {
        const jar = new Map<string, string>();
        return {
          async request(
            path: string,
            method = 'GET',
            body?: unknown,
            extra: Record<string, string> = {},
          ) {
            const headers: Record<string, string> = {
              Origin: payConfig.PUBLIC_APP_URL,
              ...extra,
            };
            if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
            if (method !== 'GET') headers['Content-Type'] = 'application/json';
            const res = await fetch(origin + path, {
              method,
              headers,
              body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
              redirect: 'manual',
            });
            for (const cookie of res.headers.getSetCookie()) {
              const pair = cookie.split(';')[0];
              const at = pair.indexOf('=');
              const k = pair.slice(0, at);
              const v = pair.slice(at + 1);
              if (v) jar.set(k, v);
              else jar.delete(k);
            }
            return {
              status: res.status,
              body: res.headers.get('content-type')?.includes('application/json')
                ? await res.json()
                : await res.text(),
            };
          },
        };
      }

      async function registerUser(email: string, name: string): Promise<Identity> {
        const client = makeClient();
        const password = 'Foundation-test-password-2026!';
        const s = await client.request('/api/auth/sign-up/email', 'POST', {
          email,
          name,
          password,
        });
        assert.equal(s.status, 202, JSON.stringify(s.body));
        await db.user.update({ where: { email }, data: { emailVerified: true } });
        const l = await client.request('/api/auth/sign-in/email', 'POST', { email, password });
        assert.equal(l.status, 200, JSON.stringify(l.body));
        const me = await client.request('/api/v1/me');
        assert.equal(me.status, 200);
        return { client, me: me.body as { user: { id: string } } };
      }

      return { createMailClientForLocalPort: makeClient, registerOnOrigin: registerUser };
    })();
    void createMailClientForLocalPort;

    async function send(person: Identity, path: string, body: unknown, key = randomUUID()) {
      const me = await person.client.request('/api/v1/me');
      return person.client.request(path, 'POST', body, {
        'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
        'Idempotency-Key': key,
      });
    }

    const [buyer, maker, checker, artisanA, artisanB, outsider] = await Promise.all(
      ['buyer', 'maker', 'checker', 'artisan-a', 'artisan-b', 'outsider'].map((role) =>
        registerOnOrigin(`pay-${role}@example.com`, `Synthetic ${role}`),
      ),
    );

    await db.craftSkill.upsert({
      where: { id: 'weaving' },
      create: { id: 'weaving', name: 'Weaving', category: 'TEXTILE' },
      update: {},
    });

    const fixture = await seedCommerceFixture(
      db,
      {
        buyerId: buyer.me.user.id,
        operatorId: maker.me.user.id,
        artisanId: artisanA.me.user.id,
        qualityId: checker.me.user.id,
        outsiderId: outsider.me.user.id,
      },
      'dhmad-pay',
    );

    const artisanBProfile = await db.artisanProfile.create({
      data: {
        userId: artisanB.me.user.id,
        displayName: 'Synthetic Artisan B',
        region: 'Kairouan',
        preferredLanguage: 'fr',
      },
    });

    const makerMembership = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: fixture.operatorOrganizationId,
          userId: maker.me.user.id,
        },
      },
    });
    const checkerMembership = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: fixture.operatorOrganizationId,
          userId: checker.me.user.id,
        },
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
          organizationId: fixture.buyerOrganizationId,
          assignedById: maker.me.user.id,
        },
      });
      await db.membershipPermission.createMany({
        data: [
          'finance.payable.reconcile',
          'finance.payout.read',
          'finance.payout.request',
          'finance.payout.approve',
          'finance.payout.execute',
          'finance.dispute.manage',
        ].map((permission) => ({
          membershipId: membership.id,
          permission,
          grantedById: maker.me.user.id,
          reason: 'Synthetic payment integration test authority',
        })),
      });
    }

    await check(
      'PAY B2B: dynamic multi-artisan plan, amendment, escrow lock, delivery guard, webhook settlement & simulated payout',
      async () => {
        const rfq = await db.commercialRfq.create({
          data: {
            buyerOrganizationId: fixture.buyerOrganizationId,
            operatorOrganizationId: fixture.operatorOrganizationId,
            craftSkillId: 'weaving',
            title: 'B2B Ceremonial Tapestry',
            specification: 'Handwoven wool',
            designRequirements: 'Natural dye',
            quantity: 1,
            deliveryAt: new Date(fixture.deliveryAt),
            deliveryLocation: 'Tunis',
            status: 'ACCEPTED',
            procurementManaged: true,
            order: { create: { status: 'APPROVED' } },
          },
          include: { order: true },
        });
        const orderId = rfq.order!.id;
        const rev = await db.procurementRevision.create({
          data: {
            rfqId: rfq.id,
            version: 1,
            authorId: maker.me.user.id,
            reason: 'B2B Terms',
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
            explanation: 'Feasible',
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
            components: [{ category: 'MATERIALS', amountTnd: '200.000' }],
            subtotalMillimes: 200_000n,
            marginMethod: 'NONE',
            marginBasisPoints: 0,
            sellingMillimes: 2_000_000n,
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
            revisionId: rev.id,
            authorId: maker.me.user.id,
            totalMillimes: 2_000_000n,
            expiresAt: new Date(fixture.quoteExpiresAt),
            snapshot: {},
            feasibilityAssessmentId: assessment.id,
            costEstimateId: cost.id,
            termsSha256: 'cd'.repeat(32),
            acceptance: { create: { orderId, actorId: buyer.me.user.id, snapshot: {} } },
          },
        });

        // Cannot create obligation before financial plan approval
        const blockedOb = await send(buyer, '/api/v1/payments/obligations', {
          channel: 'B2B',
          orderId,
          buyerEmail: 'pay-buyer@example.com',
          feeBearer: 'SELLER',
          reason: 'Premature checkout',
        });
        assert.equal(blockedOb.status, 409);

        // Initial plan (GROSS: 30% A = 600 TND, 20% B = 400 TND)
        const draft1 = await send(
          maker,
          `/api/v1/finance/orders/${orderId}/financial-plan-drafts`,
          {
            basis: 'GROSS',
            expectedFeeTnd: '100.000',
            artisans: [
              { artisanId: fixture.artisanProfileId, basisPoints: 3000 },
              { artisanId: artisanBProfile.id, basisPoints: 2000 },
            ],
            reason: 'Initial multi-artisan plan',
          },
        );
        assert.equal(draft1.status, 201, JSON.stringify(draft1.body));
        const d1Id = (draft1.body as { id: string }).id;
        const app1 = await send(
          checker,
          `/api/v1/finance/orders/${orderId}/financial-plan-drafts/${d1Id}/approve`,
          { reason: 'Checker approves v1' },
        );
        assert.equal(app1.status, 201, JSON.stringify(app1.body));

        // Authorized amendment before checkout lock (AFTER_MATERIALS: base = 1800 TND -> 30% = 540 TND, 20% = 360 TND)
        const amend = await send(
          maker,
          `/api/v1/finance/orders/${orderId}/financial-plan-amendments`,
          {
            basis: 'AFTER_MATERIALS',
            expectedFeeTnd: '100.000',
            artisans: [
              { artisanId: fixture.artisanProfileId, basisPoints: 3000 },
              { artisanId: artisanBProfile.id, basisPoints: 2000 },
            ],
            reason: 'Switch base to after materials',
          },
        );
        assert.equal(amend.status, 201, JSON.stringify(amend.body));
        const amendId = (amend.body as { id: string }).id;
        const app2 = await send(
          checker,
          `/api/v1/finance/orders/${orderId}/financial-plan-drafts/${amendId}/approve`,
          { reason: 'Checker approves amendment v2' },
        );
        assert.equal(app2.status, 201);
        assert.equal((app2.body as { revision: number }).revision, 2);

        // Create B2B central-recipient obligation & standard escrow
        const obRes = await send(buyer, '/api/v1/payments/obligations', {
          channel: 'B2B',
          orderId,
          buyerEmail: 'pay-buyer@example.com',
          feeBearer: 'SELLER',
          reason: 'Buyer initiates B2B escrow',
        });
        assert.equal(obRes.status, 201, JSON.stringify(obRes.body));
        const ob = obRes.body as {
          id: string;
          escrow: { externalEscrowId: string; mode: string; sellerSigned: boolean };
        };
        assert.equal(ob.escrow.mode, 'standard');
        assert.equal(ob.escrow.sellerSigned, true);
        assert.equal('allocationSnapshot' in (obRes.body as Record<string, unknown>), false);

        // Amendment must now be blocked because active obligation locks plan
        const lockedAmend = await send(
          maker,
          `/api/v1/finance/orders/${orderId}/financial-plan-amendments`,
          {
            basis: 'GROSS',
            expectedFeeTnd: '100.000',
            artisans: [{ artisanId: fixture.artisanProfileId, basisPoints: 3000 }],
            reason: 'Illegal post-lock edit',
          },
        );
        assert.equal(lockedAmend.status, 409);

        // Outsider & buyer isolation check
        assert.equal(
          (await outsider.client.request(`/api/v1/payments/obligations/${ob.id}`)).status,
          404,
        );
        const buyerRead = await buyer.client.request(`/api/v1/payments/obligations/${ob.id}`);
        assert.equal(buyerRead.status, 200);
        assert.equal('allocationSnapshot' in (buyerRead.body as Record<string, unknown>), false);

        // Buyer signs contract & funds via checkout sessions
        const signSess = await send(
          buyer,
          `/api/v1/payments/obligations/${ob.id}/checkout-sessions`,
          {
            action: 'sign_contract',
            redirectPath: '/procurement',
          },
        );
        assert.equal(signSess.status, 201);
        mock.simulateSessionCompletion(
          (signSess.body as { externalSessionId: string }).externalSessionId,
        );

        const paySess = await send(
          buyer,
          `/api/v1/payments/obligations/${ob.id}/checkout-sessions`,
          {
            action: 'accept_pay',
            redirectPath: '/procurement',
          },
        );
        assert.equal(paySess.status, 201);
        const paySessionId = (paySess.body as { id: string; externalSessionId: string }).id;
        const payExtSessId = (paySess.body as { externalSessionId: string }).externalSessionId;

        // Redirect callback before actual completion does NOT mark paid
        const earlySync = await send(
          buyer,
          `/api/v1/payments/checkout-sessions/${paySessionId}/sync`,
          {},
        );
        assert.equal(earlySync.status, 201);
        assert.equal(
          (await db.paymentObligation.findUniqueOrThrow({ where: { id: ob.id } })).status,
          'AWAITING_PAYMENT',
        );

        // Simulate completion on DHMAD & sync
        mock.simulateSessionCompletion(payExtSessId);
        await send(buyer, `/api/v1/payments/checkout-sessions/${paySessionId}/sync`, {});
        assert.equal(
          (await db.paymentObligation.findUniqueOrThrow({ where: { id: ob.id } })).status,
          'FUNDS_SECURED',
        );

        // Physical delivery gate: cannot declare delivery without DeliveryReport
        const prematureDeliver = await send(
          maker,
          `/api/v1/payments/obligations/${ob.id}/deliver`,
          {
            reason: 'Premature shipment attempt',
          },
        );
        assert.equal(prematureDeliver.status, 409);

        // Record Shipment + DeliveryReport, then declare delivery
        const shipment = await db.shipment.create({
          data: {
            orderId,
            hub: 'Tunis Hub',
            destination: 'Tunis Buyer',
            status: 'DELIVERY_REPORTED',
            actorId: maker.me.user.id,
            deliveryReport: {
              create: {
                quantity: 1,
                actorId: maker.me.user.id,
                occurredAt: new Date(),
                note: 'Signed',
              },
            },
          },
        });
        assert.ok(shipment.id);

        const delivered = await send(maker, `/api/v1/payments/obligations/${ob.id}/deliver`, {
          reason: 'Delivery report verified',
        });
        assert.equal(delivered.status, 201, JSON.stringify(delivered.body));

        // Buyer completes escrow -> signed webhook -> durable inbox -> worker processes -> SETTLED
        const completeSess = await send(
          buyer,
          `/api/v1/payments/obligations/${ob.id}/checkout-sessions`,
          {
            action: 'complete',
            redirectPath: '/procurement',
          },
        );
        assert.equal(completeSess.status, 201);
        const done = mock.simulateSessionCompletion(
          (completeSess.body as { externalSessionId: string }).externalSessionId,
        );

        const webhookPayload = {
          id: randomUUID(),
          type: 'escrow.status.updated',
          timestamp: new Date().toISOString(),
          data: {
            escrow: {
              id: ob.escrow.externalEscrowId,
              amount: 2000,
              amountTnd: 2000,
              currency: 'TND',
              escrowFee: 100,
              feeBearer: 'seller',
              buyerFundingTnd: 2000,
              releasedTotalTnd: Number(done.escrow.releasedTotalMillimes! / 1000n),
              status: 'completed',
            },
          },
        };
        const signed = mock.signWebhookForTest(webhookPayload);
        const whRes = await fetch(`${origin}/api/v1/webhooks/dhmad`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signed.signature,
            'X-Webhook-Timestamp': signed.timestamp,
            'X-Webhook-Id': signed.webhookId,
            'X-Webhook-Event': 'escrow.status.updated',
          },
          body: signed.rawBody,
        });
        assert.equal(whRes.status, 200);
        assert.equal(((await whRes.json()) as { duplicate: boolean }).duplicate, false);

        // Duplicate webhook delivery must deduplicate safely
        const whDup = await fetch(`${origin}/api/v1/webhooks/dhmad`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signed.signature,
            'X-Webhook-Timestamp': signed.timestamp,
            'X-Webhook-Id': signed.webhookId,
            'X-Webhook-Event': 'escrow.status.updated',
          },
          body: signed.rawBody,
        });
        assert.equal(whDup.status, 200);
        assert.equal(((await whDup.json()) as { duplicate: boolean }).duplicate, true);

        await webhooks.processPending(10);

        const finalOb = await db.paymentObligation.findUniqueOrThrow({ where: { id: ob.id } });
        assert.equal(finalOb.status, 'SETTLED');
        assert.equal(finalOb.releasedToNasjMillimes, 1_900_000n);
        assert.equal(finalOb.actualFeeMillimes, 100_000n);

        // Out-of-order stale paid webhook must NOT regress SETTLED
        const stalePayload = {
          id: randomUUID(),
          type: 'escrow.status.updated',
          timestamp: new Date().toISOString(),
          data: {
            escrow: {
              id: ob.escrow.externalEscrowId,
              amount: 2000,
              amountTnd: 2000,
              status: 'paid',
            },
          },
        };
        const staleSigned = mock.signWebhookForTest(stalePayload);
        await fetch(`${origin}/api/v1/webhooks/dhmad`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': staleSigned.signature,
            'X-Webhook-Timestamp': staleSigned.timestamp,
            'X-Webhook-Id': staleSigned.webhookId,
            'X-Webhook-Event': 'escrow.status.updated',
          },
          body: staleSigned.rawBody,
        });
        await webhooks.processPending(10);
        assert.equal(
          (await db.paymentObligation.findUniqueOrThrow({ where: { id: ob.id } })).status,
          'SETTLED',
        );

        // Artisan payable + simulated payout (maker != checker) + duplicate payout prevention
        const offer = await db.commercialOffer.create({
          data: {
            orderId,
            artisanProfileId: fixture.artisanProfileId,
            capacityDeclarationId: fixture.capacityDeclarationId,
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            quantity: 1,
            unitPayMillimes: 540_000n,
            estimatedHours: '10-12h',
            expiresAt: new Date(Date.now() + 86_400_000),
            materials: 'Wool',
            reworkTerms: 'Standard',
            paymentConditions: 'After materials 30%',
            batch: {
              create: { orderId, artisanProfileId: fixture.artisanProfileId },
            },
          },
          include: { batch: true },
        });
        const payable = await db.artisanPayable.create({
          data: {
            offerId: offer.id,
            orderId,
            batchId: offer.batch!.id,
            artisanProfileId: fixture.artisanProfileId,
            milestone: 'BUYER_ACCEPTED_PIECE',
            policyVersion: 1,
            quantity: 1,
            unitPayMillimes: 540_000n,
            amountMillimes: 540_000n,
            sourceEventId: `b2b-${orderId}`,
            termsSnapshot: 'After materials 30%',
          },
        });
        const payoutReq = await db.payoutRequest.create({
          data: {
            orderId,
            payableId: payable.id,
            amountMillimes: 540_000n,
            payableSnapshotMillimes: 540_000n,
            requesterId: maker.me.user.id,
            approverId: checker.me.user.id,
            approvedAt: new Date(),
            status: 'APPROVED',
            reason: 'Independent payout approval',
          },
        });
        const simRes = await send(maker, '/api/v1/payments/payout-simulations', {
          payoutRequestId: payoutReq.id,
          reference: `SIM-${randomUUID().slice(0, 8)}`,
          outcome: 'PAID',
          reason: 'Sandbox simulated disbursement',
        });
        assert.equal(simRes.status, 201, JSON.stringify(simRes.body));
        assert.equal((simRes.body as { isSimulated: boolean }).isSimulated, true);

        // Duplicate payout simulation blocked
        const dupSim = await send(maker, '/api/v1/payments/payout-simulations', {
          payoutRequestId: payoutReq.id,
          reference: `SIM-DUP-${randomUUID().slice(0, 8)}`,
          outcome: 'PAID',
          reason: 'Duplicate attempt',
        });
        assert.equal(dupSim.status, 409);

        // Trial balance must balance
        const tb = await checker.client.request('/api/v1/payments/ledger/trial-balance');
        assert.equal(tb.status, 200);
        assert.equal((tb.body as { balanced: boolean }).balanced, true);
      },
    );

    await check(
      'PAY B2C, KYC, privacy, fault-injection reconciliation, and DB ledger triggers',
      async () => {
        // Create B2C MarketOrder
        const b2cOrder = await db.marketOrder.create({
          data: {
            buyerOrgId: fixture.buyerOrganizationId,
            kind: 'CATALOG',
            status: 'DELIVERED',
            title: 'B2C Ceramic Bowl',
            quantity: 2,
            totalMillimes: 300_000n,
            artisanPayMillimes: 150_000n,
            createdById: buyer.me.user.id,
          },
        });
        await db.marketOrderArtisan.create({
          data: {
            orderId: b2cOrder.id,
            artisanProfileId: fixture.artisanProfileId,
            recordedById: maker.me.user.id,
            payMillimes: 150_000n,
          },
        });

        const b2cPlan = await send(
          maker,
          `/api/v1/payments/b2c/orders/${b2cOrder.id}/financial-plan`,
          {
            basis: 'GROSS',
            materialCostTnd: '20.000',
            otherDirectCostTnd: '10.000',
            expectedFeeTnd: '15.000',
            artisans: [{ artisanId: fixture.artisanProfileId, basisPoints: 5000 }],
            reason: 'B2C 50% artisan share',
          },
        );
        assert.equal(b2cPlan.status, 201, JSON.stringify(b2cPlan.body));

        // Fault-injection: TIMEOUT_AFTER_CREATE quarantines ambiguous op, reconciliation recovers it
        mock.setNextFault('TIMEOUT_AFTER_CREATE');
        const failedCreate = await send(buyer, '/api/v1/payments/obligations', {
          channel: 'B2C',
          orderId: b2cOrder.id,
          buyerEmail: 'pay-buyer@example.com',
          feeBearer: 'BUYER',
          reason: 'B2C ambiguous timeout test',
        });
        assert.notEqual(failedCreate.status, 201);

        const recRes = await send(maker, '/api/v1/payments/reconciliation/run', {});
        assert.equal(recRes.status, 201, JSON.stringify(recRes.body));

        const b2cObligations = await buyer.client.request(
          `/api/v1/payments/orders/B2C/${b2cOrder.id}/obligations`,
        );
        assert.equal(b2cObligations.status, 200);
        const list = b2cObligations.body as {
          id: string;
          escrow: { externalEscrowId: string; mode: string };
        }[];
        assert.equal(list.length, 1);
        assert.equal(list[0].escrow.mode, 'quick');
        assert.ok(list[0].escrow.externalEscrowId);

        // Induce recipient mismatch in provider -> reconciliation flags DISCREPANCY_QUARANTINED
        mock.mutateEscrowForTest(list[0].escrow.externalEscrowId, {
          sellerEmail: 'hijacked@example.com',
        });
        const rec2 = await send(maker, '/api/v1/payments/reconciliation/run', {});
        assert.equal(rec2.status, 201);
        assert.ok((rec2.body as { discrepancyCount: number }).discrepancyCount >= 1);
        assert.equal(
          (await db.paymentObligation.findUniqueOrThrow({ where: { id: list[0].id } }))
            .reconciliationStatus,
          'DISCREPANCY_QUARANTINED',
        );

        // Artisan KYC + scoped myArtisanFinance (artisanB cannot see artisanA's share)
        const kycRes = await send(
          artisanA,
          `/api/v1/payments/artisans/${fixture.artisanProfileId}/kyc`,
          {
            email: 'pay-artisan-a@example.com',
            consentConfirmed: true,
            redirectPath: '/artisan',
          },
        );
        assert.equal(kycRes.status, 201, JSON.stringify(kycRes.body));
        assert.equal((kycRes.body as { provenance: string }).provenance, 'MOCK_SIMULATION');

        // Artisan A sees their own allocation; Artisan B does not see Artisan A's B2C allocation
        const myFinA = await artisanA.client.request('/api/v1/payments/artisan/me');
        const myFinB = await artisanB.client.request('/api/v1/payments/artisan/me');
        assert.equal(myFinA.status, 200);
        assert.equal(myFinB.status, 200);
        assert.ok(
          (myFinA.body as { allocations: { orderId: string }[] }).allocations.some(
            (a) => a.orderId === b2cOrder.id,
          ),
        );
        assert.equal(
          (myFinB.body as { allocations: { orderId: string }[] }).allocations.some(
            (a) => a.orderId === b2cOrder.id,
          ),
          false,
        );

        // Verify forged webhook is rejected
        const forged = await fetch(`${origin}/api/v1/webhooks/dhmad`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': 'f'.repeat(64),
            'X-Webhook-Timestamp': new Date().toISOString(),
            'X-Webhook-Id': randomUUID(),
            'X-Webhook-Event': 'escrow.status.updated',
          },
          body: JSON.stringify({ id: 'forged', type: 'escrow.status.updated', data: {} }),
        });
        assert.equal(forged.status, 401);

        // Verify PostgreSQL append-only & deferred balance triggers on JournalBatch/JournalEntry
        const anyEntry = await db.journalEntry.findFirstOrThrow();
        await assert.rejects(
          () => db.$executeRaw`DELETE FROM "JournalEntry" WHERE "id" = ${anyEntry.id}`,
        );
        const anyBatch = await db.journalBatch.findFirstOrThrow();
        await assert.rejects(
          () =>
            db.$executeRaw`UPDATE "JournalBatch" SET "description" = 'tampered' WHERE "id" = ${anyBatch.id}`,
        );
        await assert.rejects(() =>
          db.$transaction(async (tx) => {
            await tx.journalEntry.create({
              data: {
                batchId: anyBatch.id,
                accountCode: 'ESCROW_HELD',
                side: 'DEBIT',
                amountMillimes: 1000n,
              },
            });
          }),
        );
      },
    );
  } finally {
    await payApp?.close();
  }
}
