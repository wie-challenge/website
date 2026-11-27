import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { validateEnvironment } from '../../src/config/env.js';
import {
  DhmadSandboxAdapter,
  normalizeDhmadWebhookPayload,
  verifyDhmadWebhookSignature,
} from '../../src/modules/payments/dhmad.adapter.js';
import { ProviderError, mapDhmadEscrowStatus } from '../../src/modules/payments/provider.types.js';

const baseEnv = {
  NODE_ENV: 'development',
  PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://nasj:secret@127.0.0.1:5432/nasj',
  BETTER_AUTH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
};

test('env validation blocks live DHMAD keys, real payouts, and production financial execution', () => {
  assert.throws(
    () => validateEnvironment({ ...baseEnv, REAL_PAYOUTS_ENABLED: 'true' }),
    /REAL_PAYOUTS_ENABLED/,
  );
  assert.throws(
    () =>
      validateEnvironment({
        ...baseEnv,
        DHMAD_API_KEY: ['sk', 'live', 'test_forbidden'].join('_'),
      }),
    /sk_live_/,
  );
  assert.throws(
    () => validateEnvironment({ ...baseEnv, DHMAD_BASE_URL: 'https://dhmad.tn/api' }),
    /sandbox\.dhmad\.tn/,
  );
  assert.throws(
    () =>
      validateEnvironment({
        ...baseEnv,
        DHMAD_CHECKOUT_RETURN_URL: 'https://evil.example.com/callback',
      }),
    /PUBLIC_APP_URL/,
  );
  assert.throws(
    () =>
      validateEnvironment({
        ...baseEnv,
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://nasj.tn',
        REQUIRE_PRIVILEGED_MFA: 'true',
        ARCJET_ENABLED: 'true',
        ARCJET_KEY: 'ajkey_1234567890',
        ARCJET_MODE: 'LIVE',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        PAYMENTS_ENABLED: 'true',
      }),
    /Production financial execution is disabled/,
  );
});

test('DhmadSandboxAdapter enforces sandbox origin and sk_sandbox_ keys', () => {
  assert.throws(
    () =>
      new DhmadSandboxAdapter({
        baseUrl: 'https://dhmad.tn/api',
        apiKey: ['sk', 'sandbox', 'abc'].join('_'),
      }),
    ProviderError,
  );
  const adapter = new DhmadSandboxAdapter({
    baseUrl: 'https://sandbox.dhmad.tn/api',
    apiKey: ['sk', 'live', 'forbidden'].join('_'),
  });
  return assert.rejects(
    () => adapter.verifyAccountAssociation(),
    (err: unknown) => err instanceof ProviderError && err.code === 'LIVE_KEY_FORBIDDEN',
  );
});

test('DhmadSandboxAdapter contract tests against loopback DHMAD mock server', async () => {
  const seenRequests: { method: string; url: string; auth: string; body: unknown }[] = [];
  let mode: 'ok' | 'rate_limit' | 'unassociated' | 'server_error' | 'bad_schema' = 'ok';

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      seenRequests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        auth: String(req.headers.authorization ?? ''),
        body: text ? JSON.parse(text) : null,
      });

      if (mode === 'rate_limit') {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'X-RateLimit-Reset': new Date(Date.now() + 30_000).toISOString(),
        });
        res.end(JSON.stringify({ error: 'Too Many Requests', message: 'Slow down' }));
        return;
      }
      if (mode === 'server_error') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable' }));
        return;
      }
      if (mode === 'bad_schema') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ unexpected: true }));
        return;
      }
      if (req.url === '/v1/me') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            apiKey: { environment: 'sandbox', isActive: true, permissions: ['disputes:read'] },
            developer: { email: 'nasj@example.com' },
          }),
        );
        return;
      }
      if (req.url === '/v1/balance') {
        if (mode === 'unassociated') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden', message: 'Not associated' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ balance: { available: 1200.5, pending: 0, escrow: 500 } }));
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/escrows') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            escrow: {
              id: 'esc_123',
              title: 'B2C Rug',
              amount: 2000,
              amountTnd: 2000,
              currency: 'TND',
              escrowFee: 100,
              feeBearer: 'seller',
              buyerFundingTnd: 2000,
              status: 'pending',
              mode: 'quick',
              seller: { email: 'nasj@example.com' },
              buyer: { email: 'buyer@example.com' },
            },
            contract: null,
          }),
        );
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/escrows/esc_123/sessions') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            sessionId: 'sess_123',
            url: 'https://sandbox.dhmad.tn/checkout/sess_123',
            expiresAt: new Date(Date.now() + 1800_000).toISOString(),
          }),
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const adapter = new DhmadSandboxAdapter({
    baseUrl: `http://127.0.0.1:${addr.port}`,
    apiKey: ['sk', 'sandbox', 'loopback_contract_test_fixture'].join('_'),
    webhookSecret: 'test_secret_for_loopback_contract',
    allowLoopbackForTest: true,
  });

  try {
    const assoc = await adapter.verifyAccountAssociation();
    assert.equal(assoc.authenticated, true);
    assert.equal(assoc.associatedAccountVerified, true);
    assert.equal(assoc.associatedBalanceAvailableTnd, '1200.500');

    mode = 'unassociated';
    const unassoc = await adapter.verifyAccountAssociation();
    assert.equal(unassoc.authenticated, true);
    assert.equal(unassoc.associatedAccountVerified, false);

    mode = 'ok';
    const created = await adapter.createEscrow({
      externalReference: 'nasj_ref_1',
      title: 'B2C Rug',
      amountMillimes: 2_000_000n,
      currency: 'TND',
      buyerEmail: 'buyer@example.com',
      mode: 'quick',
      feeBearer: 'SELLER',
      reviewHours: 72,
    });
    assert.equal(created.externalEscrowId, 'esc_123');
    assert.equal(created.amountMillimes, 2_000_000n);
    assert.equal(created.escrowFeeMillimes, 100_000n);

    // Ensure sellerEmail and developerFeePercentage were omitted so NASJ associated account is seller.
    const createBody = seenRequests.at(-1)?.body as Record<string, unknown>;
    assert.equal('sellerEmail' in createBody, false);
    assert.equal('developerFeePercentage' in createBody, false);
    assert.deepEqual(createBody.completionPolicy, {
      type: 'delivery_confirmation',
      buyerReviewDeadlineHours: 72,
    });

    const session = await adapter.createCheckoutSession({
      externalEscrowId: 'esc_123',
      action: 'accept_pay',
      targetUserEmail: 'buyer@example.com',
      redirectUrl: 'http://localhost:3000/orders/1',
    });
    assert.equal(session.externalSessionId, 'sess_123');

    mode = 'rate_limit';
    await assert.rejects(
      () => adapter.getEscrow('esc_123'),
      (e: unknown) => e instanceof ProviderError && e.category === 'RATE_LIMITED',
    );

    mode = 'server_error';
    await assert.rejects(
      () =>
        adapter.createEscrow({
          externalReference: 'nasj_ref_2',
          title: 'Timeout',
          amountMillimes: 100_000n,
          currency: 'TND',
          buyerEmail: 'buyer@example.com',
          mode: 'quick',
          feeBearer: 'SELLER',
          reviewHours: 72,
        }),
      (e: unknown) => e instanceof ProviderError && e.category === 'AMBIGUOUS_TIMEOUT',
    );

    mode = 'bad_schema';
    await assert.rejects(
      () => adapter.getEscrow('esc_123'),
      (e: unknown) => e instanceof ProviderError && e.category === 'INVALID_RESPONSE',
    );
  } finally {
    server.close();
  }
});

test('DHMAD webhook verification enforces HMAC-SHA256 and 5-minute replay window', () => {
  const secret = 'webhook_secret_for_testing_123456';
  const payload = {
    id: 'evt_1',
    type: 'escrow.status.updated',
    timestamp: new Date().toISOString(),
    data: {
      escrow: {
        id: 'esc_1',
        amount: 500,
        amountTnd: 500,
        status: 'paid',
      },
    },
  };
  const rawBody = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  assert.equal(
    verifyDhmadWebhookSignature(
      {
        rawBody,
        parsedBody: payload,
        signature: sig,
        timestamp: payload.timestamp,
        webhookId: 'evt_1',
        eventHeader: 'escrow.status.updated',
      },
      secret,
    ),
    true,
  );

  // Forged signature rejected
  assert.equal(
    verifyDhmadWebhookSignature(
      {
        rawBody,
        parsedBody: payload,
        signature: '0'.repeat(64),
        timestamp: payload.timestamp,
        webhookId: 'evt_1',
        eventHeader: 'escrow.status.updated',
      },
      secret,
    ),
    false,
  );

  // Stale (>5m) timestamp rejected
  const staleTs = new Date(Date.now() - 6 * 60_000).toISOString();
  assert.equal(
    verifyDhmadWebhookSignature(
      {
        rawBody,
        parsedBody: payload,
        signature: sig,
        timestamp: staleTs,
        webhookId: 'evt_1',
        eventHeader: 'escrow.status.updated',
      },
      secret,
    ),
    false,
  );

  const normalized = normalizeDhmadWebhookPayload(
    'evt_1',
    'escrow.status.updated',
    new Date(),
    payload,
  );
  assert.equal(normalized.kind, 'ESCROW_STATUS');
  if (normalized.kind === 'ESCROW_STATUS') {
    assert.equal(normalized.escrow.normalizedStatus, 'FUNDS_SECURED');
  }
  assert.equal(mapDhmadEscrowStatus('mystery_status'), 'UNKNOWN');
});
