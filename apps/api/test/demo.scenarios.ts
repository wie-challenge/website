import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { DemoSessionView } from '@nasj/contracts';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';

export async function runDemoScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ demo: true });
  const mail = await captureMail();
  const config = testConfig(database.url, mail.port, { DEMO_MODE: 'true', RATE_API_MAX: 3000 });
  const app = await createApp({ config });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const db = app.get(PrismaService);
    function visitor() {
      const jar = new Map<string, string>();
      let proof = '';
      async function request(
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL, ...extra };
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        const res = await fetch(base + path, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        });
        for (const cookie of res.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
          else jar.delete(pair.slice(0, at));
        }
        const value = await res.json();
        if (value.csrfToken && path.endsWith('/demo/session')) proof = value.csrfToken;
        return { status: res.status, body: value };
      }
      return {
        jar,
        request,
        session: async () => (await request('/api/v1/demo/session')).body as DemoSessionView,
        command: (op: string, body = {}, key = randomUUID()) =>
          request(`/api/v1/demo/${op}`, 'POST', body, {
            'X-Demo-CSRF': proof,
            'Idempotency-Key': key,
          }),
      };
    }
    const a = visitor(),
      b = visitor();
    let first!: DemoSessionView, second!: DemoSessionView;
    await check(
      'showroom uses six real scoped authenticated accounts without exposing credentials',
      async () => {
        await a.session();
        await b.session();
        const missing = await a.request('/api/v1/demo/start', 'POST', {});
        assert.equal(missing.status, 403);
        const key = randomUUID();
        const started = await a.command('start', {}, key);
        assert.equal(started.status, 201, JSON.stringify(started.body));
        first = started.body;
        assert.equal((await a.command('start', {}, key)).body.scenario.id, first.scenario!.id);
        second = (await b.command('start')).body;
        assert.notEqual(first.scenario!.id, second.scenario!.id);
        assert.equal(first.personas.length, 6);
        assert.equal(JSON.stringify(first).includes('password'), false);
        for (const persona of first.personas) {
          const switched = await a.command('switch', { persona: persona.id });
          assert.equal(switched.status, 201, JSON.stringify(switched.body));
          assert.equal((await a.request('/api/v1/me')).status, 200);
          assert.equal((await a.session()).scenario!.id, first.scenario!.id);
        }
        const previousPersona = visitor();
        for (const [name, value] of a.jar) previousPersona.jar.set(name, value);
        await a.command('switch', { persona: 'buyer' });
        assert.notEqual((await previousPersona.request('/api/v1/me')).status, 200);
        assert.equal(
          (await a.request(`/api/v1/procurement/rfqs/${second.scenario!.rfqId}`)).status,
          404,
        );
        assert.equal((await a.request('/api/v1/admin/users')).status, 403);
        const stolen = visitor();
        for (const [name, value] of a.jar)
          if (name !== 'nasj_demo_visitor') stolen.jar.set(name, value);
        assert.equal((await stolen.request('/api/v1/me')).status, 403);
        const body = await a.session();
        assert.equal(body.scenario!.totals.payableMillimes, '0');
      },
    );
    await check(
      'accountless showroom reports remain pending and revoked memberships cannot be restored by switching',
      async () => {
        const business = async (who: ReturnType<typeof visitor>, path: string, body: unknown) => {
          const me = await who.request('/api/v1/me');
          return who.request(path, 'POST', body, {
            'X-CSRF-Token': me.body.csrfToken,
            'Idempotency-Key': randomUUID(),
          });
        };
        await b.command('switch', { persona: 'buyer' });
        const detail = await b.request(`/api/v1/procurement/rfqs/${second.scenario!.rfqId}`);
        const quote = detail.body.quotes[0];
        const accepted = await business(
          b,
          `/api/v1/procurement/rfqs/${second.scenario!.rfqId}/accept`,
          {
            version: detail.body.rfq.version,
            quoteId: quote.id,
            confirm: true,
            termsSha256: quote.termsSha256,
          },
        );
        assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
        const orderId = (await b.session()).scenario!.orderId!;
        assert.ok(orderId);
        for (const persona of second.personas) {
          const shared = await b.command('switch', { persona: persona.id });
          assert.equal(shared.status, 201);
          assert.equal(shared.body.scenario.id, second.scenario!.id);
          assert.equal(shared.body.scenario.orderId, orderId);
          assert.equal(shared.body.scenario.rfqId, second.scenario!.rfqId);
          assert.equal(shared.body.scenario.totals.orders, 1);
          assert.equal((await b.session()).scenario!.orderId, orderId);
        }
        await b.command('switch', { persona: 'production' });
        const assessed = await business(
          b,
          `/api/v1/procurement/orders/${orderId}/eligibility-assessments`,
          { version: 1, restrictionsReviewed: true, restrictionSource: 'Synthetic source review' },
        );
        assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
        const candidate = assessed.body.assessments.find(
          (a: { artisanProfileId: string }) =>
            a.artisanProfileId === second.scenario!.accountlessArtisanId,
        );
        assert.equal(candidate.decision, 'ELIGIBLE');
        const prepared = await business(b, `/api/v1/procurement/orders/${orderId}/offers`, {
          version: assessed.body.summary.orderVersion,
          eligibilityId: candidate.id,
          quantity: 1,
          expiresAt: second.scenario!.offerExpiresAt,
          materials: 'Synthetic thread',
          reworkTerms: 'New voluntary agreement',
          paymentConditions: 'Synthetic governed payable',
          collectionArrangement: 'Association pickup',
          instructions: 'Synthetic sample',
        });
        assert.equal(prepared.status, 201, JSON.stringify(prepared.body));
        const issued = await business(b, `/api/v1/procurement/offers/${prepared.body.id}/issue`, {
          version: prepared.body.version,
        });
        assert.equal(issued.status, 201);
        await b.command('switch', { persona: 'coordinator' });
        const reported = await business(
          b,
          `/api/v1/procurement/offers/${prepared.body.id}/assisted-decisions`,
          {
            version: issued.body.version,
            decision: 'ACCEPT',
            evidenceReference: 'Synthetic reported acceptance, unapproved method',
          },
        );
        assert.equal(reported.status, 201, JSON.stringify(reported.body));
        assert.equal(reported.body.assisted.verificationStatus, 'PENDING_UNAPPROVED_METHOD');
        const verified = await business(
          b,
          `/api/v1/procurement/offers/${prepared.body.id}/assisted-decisions/${reported.body.assisted.id}/verify`,
          {},
        );
        assert.equal(verified.status, 409);
        assert.equal(await db.commercialBatch.count({ where: { orderId } }), 0);
        const identity = await db.demoIdentity.findUniqueOrThrow({
          where: { scenarioId_persona: { scenarioId: second.scenario!.id, persona: 'production' } },
        });
        await db.organizationMember.update({
          where: {
            organizationId_userId: {
              organizationId: second.scenario!.operatorOrganizationId,
              userId: identity.userId,
            },
          },
          data: { status: 'SUSPENDED' },
        });
        await b.command('switch', { persona: 'production' });
        assert.notEqual(
          (await b.request(`/api/v1/procurement/orders/${orderId}/execution`)).status,
          200,
        );
        // Existing permissions stay revoked; switching never provisions them again.
        assert.equal(
          (
            await db.organizationMember.findUniqueOrThrow({
              where: {
                organizationId_userId: {
                  organizationId: second.scenario!.operatorOrganizationId,
                  userId: identity.userId,
                },
              },
            })
          ).status,
          'SUSPENDED',
        );
      },
    );
    await check(
      'showroom buyer feedback is visitor-scoped, source-labelled and never shared across generations',
      async () => {
        const business = async (who: ReturnType<typeof visitor>, path: string, body: unknown) => {
          const me = await who.request('/api/v1/me');
          return who.request(path, 'POST', body, {
            'X-CSRF-Token': me.body.csrfToken,
            'Idempotency-Key': randomUUID(),
          });
        };
        await b.command('switch', { persona: 'buyer' });
        const orderId = (await b.session()).scenario!.orderId!;
        const buyerIdentity = await db.demoIdentity.findUniqueOrThrow({
          where: {
            scenarioId_persona: { scenarioId: second.scenario!.id, persona: 'buyer' },
          },
        });
        // Synthetic fixture only: a real receipt row so eligibility can be exercised over HTTP.
        const shipment = await db.shipment.create({
          data: {
            orderId,
            status: 'BUYER_CONFIRMED',
            hub: 'Synthetic showroom hub',
            destination: 'Synthetic Tunis buyer studio',
            actorId: buyerIdentity.userId,
            deliveryReport: {
              create: {
                quantity: 4,
                actorId: buyerIdentity.userId,
                occurredAt: new Date('2026-10-01T09:00:00Z'),
              },
            },
          },
        });
        const receipt = await db.buyerDeliveryConfirmation.create({
          data: {
            shipmentId: shipment.id,
            received: 4,
            accepted: 4,
            missing: 0,
            damaged: 0,
            actorId: buyerIdentity.userId,
            occurredAt: new Date('2026-10-01T10:00:00Z'),
          },
        });
        const created = await business(b, `/api/v1/collaboration/orders/${orderId}/feedback`, {
          receiptConfirmationId: receipt.id,
          category: 'QUALITY',
          rating: 4,
          comment: 'Synthetic visitor opinion about the showroom sample.',
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.equal(created.body.sourceClass, 'DEMO_USER_SUBMITTED');
        const stored = await db.buyerOrderFeedback.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        assert.equal(stored.scenarioId, second.scenario!.id);
        const ownView = await b.request(`/api/v1/collaboration/order-feedback?orderId=${orderId}`);
        assert.equal(ownView.status, 200);
        assert.deepEqual(
          (ownView.body as { items: { id: string }[] }).items.map((row) => row.id),
          [created.body.id],
        );
        // Another visitor never sees this synthetic assessment, even with the same buyer persona.
        await a.command('switch', { persona: 'buyer' });
        assert.equal(
          (await a.request(`/api/v1/collaboration/order-feedback?orderId=${orderId}`)).status,
          404,
        );
        assert.equal(
          (await a.request(`/api/v1/collaboration/order-feedback/${created.body.id}/history`))
            .status,
          404,
        );
        assert.equal(
          (
            await business(a, `/api/v1/collaboration/orders/${orderId}/feedback`, {
              receiptConfirmationId: receipt.id,
              category: 'OVERALL',
            })
          ).status,
          404,
        );
        assert.equal(
          JSON.stringify((await a.request('/api/v1/collaboration')).body).includes(created.body.id),
          false,
        );
        assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 1);
      },
    );
    await check(
      'showroom reset archives only owned scope, replays safely and rolls back interrupted recreation',
      async () => {
        const old = first.scenario!;
        const sentinel = await db.user.create({
          data: {
            id: randomUUID(),
            name: 'Unrelated synthetic sentinel',
            email: `sentinel-${randomUUID()}@example.com`,
            emailVerified: true,
          },
        });
        const sentinelSession = await db.session.create({
          data: {
            id: randomUUID(),
            userId: sentinel.id,
            token: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const before = await db.demoScenario.findUniqueOrThrow({
          where: { id: second.scenario!.id },
        });
        const oldIdentities = await db.demoIdentity.findMany({ where: { scenarioId: old.id } });
        const key = randomUUID();
        const input = { scenarioId: old.id, generation: old.generation, confirm: true };
        const raced = await Promise.all([
          a.command('reset', input, key),
          a.command('reset', input, key),
        ]);
        assert.deepEqual(
          raced.map((r) => r.status),
          [201, 201],
        );
        const fresh = raced[0].body.scenario;
        assert.notEqual(fresh.id, old.id);
        assert.deepEqual(fresh.totals, fresh.initialTotals);
        assert.equal((await a.command('reset', input, key)).body.scenario.id, fresh.id);
        assert.equal((await a.command('reset', input)).status, 409);
        assert.equal(
          (await db.demoScenario.findUniqueOrThrow({ where: { id: old.id } })).status,
          'ARCHIVED',
        );
        assert.equal(
          await db.session.count({ where: { userId: { in: oldIdentities.map((i) => i.userId) } } }),
          0,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: sentinel.id } })).status,
          'ACTIVE',
        );
        assert.deepEqual(
          await db.session.findUniqueOrThrow({ where: { id: sentinelSession.id } }),
          sentinelSession,
        );
        assert.deepEqual(
          await db.demoScenario.findUniqueOrThrow({ where: { id: before.id } }),
          before,
        );
        assert.equal((await b.session()).scenario!.id, before.id);
        assert.equal(
          (
            await a.command('reset', {
              scenarioId: before.id,
              generation: before.generation,
              confirm: true,
            })
          ).status,
          409,
        );
        // A test-only DB trigger interrupts activation; transaction must retain the old generation.
        await db.$executeRawUnsafe(
          `CREATE FUNCTION test_interrupt_demo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic reset interruption'; END $$`,
        );
        await db.$executeRawUnsafe(
          `CREATE TRIGGER test_interrupt_demo BEFORE INSERT ON "DemoScenario" FOR EACH ROW EXECUTE FUNCTION test_interrupt_demo()`,
        );
        assert.equal(
          (
            await a.command('reset', {
              scenarioId: fresh.id,
              generation: fresh.generation,
              confirm: true,
            })
          ).status,
          500,
        );
        assert.equal((await a.session()).scenario!.id, fresh.id);
        assert.equal(
          (await db.demoScenario.findUniqueOrThrow({ where: { id: fresh.id } })).status,
          'ACTIVE',
        );
        await db.$executeRawUnsafe('DROP TRIGGER test_interrupt_demo ON "DemoScenario"');
        await db.$executeRawUnsafe('DROP FUNCTION test_interrupt_demo()');
        const again = await a.command('reset', {
          scenarioId: fresh.id,
          generation: fresh.generation,
          confirm: true,
        });
        assert.equal(again.status, 201);
        assert.deepEqual(again.body.scenario.totals, again.body.scenario.initialTotals);
        assert.equal(await db.demoScenario.count(), 4);
        assert.ok((await db.auditEvent.count({ where: { action: 'demo.scenario.reset' } })) >= 2);
      },
    );
    await check(
      'ordinary mode denies anonymous showroom mutations without creating scenarios',
      async () => {
        const normal = await createApp({
          config: testConfig(database.url, mail.port, { DEMO_MODE: 'false' }),
        });
        try {
          await normal.listen(0, '127.0.0.1');
          const normalBase = await normal.getUrl();
          const before = await db.demoScenario.count();
          const response = await fetch(`${normalBase}/api/v1/demo/session`);
          assert.equal(response.status, 200);
          assert.equal((await response.json()).available, false);
          for (const operation of ['start', 'switch', 'reset']) {
            const denied = await fetch(`${normalBase}/api/v1/demo/${operation}`, {
              method: 'POST',
              headers: {
                Origin: config.PUBLIC_APP_URL,
                'Content-Type': 'application/json',
                'Idempotency-Key': randomUUID(),
              },
              body: JSON.stringify(operation === 'switch' ? { persona: 'buyer' } : {}),
            });
            assert.notEqual(denied.status, 201);
            assert.notEqual(denied.status, 200);
          }
          assert.equal(await db.demoScenario.count(), before);
        } finally {
          await normal.close();
        }
      },
    );
  } finally {
    await app.close();
    await mail.stop();
    await database.stop();
  }
}
