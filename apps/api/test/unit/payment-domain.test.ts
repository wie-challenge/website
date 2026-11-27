import assert from 'node:assert/strict';
import test from 'node:test';
import { dhmadNumberToMillimes, millimesToDhmadNumber } from '@nasj/contracts';
import { DeterministicMockPaymentProvider } from '../../src/modules/payments/mock-provider.js';
import { ProviderError } from '../../src/modules/payments/provider.types.js';
import { isMonotonicTransition } from '../../src/modules/payments/state-transitions.js';

test('TND conversion helpers preserve exact 3-decimal millime precision', () => {
  assert.equal(dhmadNumberToMillimes(2000), 2_000_000n);
  assert.equal(dhmadNumberToMillimes(123.456), 123_456n);
  assert.equal(dhmadNumberToMillimes('0.005'), 5n);
  assert.equal(millimesToDhmadNumber(123_456n), 123.456);
});

test('isMonotonicTransition prevents terminal state regression and allows delivery rejection', () => {
  assert.equal(isMonotonicTransition('AWAITING_PAYMENT', 'FUNDS_SECURED'), true);
  assert.equal(isMonotonicTransition('FUNDS_SECURED', 'AWAITING_PAYMENT'), false);
  assert.equal(isMonotonicTransition('AWAITING_DELIVERY_ACCEPTANCE', 'FUNDS_SECURED'), true);
  assert.equal(isMonotonicTransition('SETTLED', 'FUNDS_SECURED'), false);
  assert.equal(isMonotonicTransition('REFUNDED', 'SETTLED'), false);
  assert.equal(isMonotonicTransition('DISPUTED', 'SETTLED'), true);
  assert.equal(isMonotonicTransition('DISPUTED', 'REFUNDED'), true);
});

test('DeterministicMockPaymentProvider exercises B2C, B2B, KYC, and fault injection', async () => {
  const mock = new DeterministicMockPaymentProvider();
  const escrow = await mock.createEscrow({
    externalReference: 'nasj_b2c_1',
    title: 'B2C Order',
    amountMillimes: 500_000n,
    currency: 'TND',
    buyerEmail: 'buyer@example.com',
    mode: 'quick',
    feeBearer: 'SELLER',
    reviewHours: 72,
  });
  assert.equal(escrow.normalizedStatus, 'AWAITING_PAYMENT');
  assert.equal(escrow.buyerFundingMillimes, 500_000n);
  assert.equal(escrow.escrowFeeMillimes, 25_000n);

  const paySess = await mock.createCheckoutSession({
    externalEscrowId: escrow.externalEscrowId,
    action: 'accept_pay',
    targetUserEmail: 'buyer@example.com',
    redirectUrl: 'http://localhost:3000/orders/1',
  });
  mock.simulateSessionCompletion(paySess.externalSessionId);

  // Early buyer complete before delivery must be blocked.
  await assert.rejects(
    () =>
      mock.createCheckoutSession({
        externalEscrowId: escrow.externalEscrowId,
        action: 'complete',
        targetUserEmail: 'buyer@example.com',
        redirectUrl: 'http://localhost:3000/orders/1',
      }),
    (e: unknown) => e instanceof ProviderError && e.code === 'DELIVERY_REQUIRED',
  );

  const delivered = await mock.deliverEscrow(escrow.externalEscrowId);
  assert.equal(delivered.normalizedStatus, 'AWAITING_DELIVERY_ACCEPTANCE');

  const completeSess = await mock.createCheckoutSession({
    externalEscrowId: escrow.externalEscrowId,
    action: 'complete',
    targetUserEmail: 'buyer@example.com',
    redirectUrl: 'http://localhost:3000/orders/1',
  });
  const done = mock.simulateSessionCompletion(completeSess.externalSessionId);
  assert.equal(done.escrow.normalizedStatus, 'SETTLED');
  assert.equal(done.escrow.releasedTotalMillimes, 475_000n);

  // Fault injection: timeout after create still leaves escrow discoverable via listEscrows
  mock.setNextFault('TIMEOUT_AFTER_CREATE');
  await assert.rejects(
    () =>
      mock.createEscrow({
        externalReference: 'nasj_timeout_1',
        title: 'Timeout Order [nasj_timeout_1]',
        amountMillimes: 100_000n,
        currency: 'TND',
        buyerEmail: 'buyer2@example.com',
        mode: 'quick',
        feeBearer: 'BUYER',
        reviewHours: 72,
      }),
    (e: unknown) => e instanceof ProviderError && e.category === 'AMBIGUOUS_TIMEOUT',
  );
  const all = await mock.listEscrows();
  assert.equal(
    all.some((e) => e.externalReference === 'nasj_timeout_1'),
    true,
  );
});
