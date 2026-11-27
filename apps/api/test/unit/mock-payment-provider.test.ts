import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockPaymentProvider } from '../../src/modules/payments/mock-provider.js';

test('mock obligation is deterministic, exact, and cannot be duplicated with conflicting terms', () => {
  const provider = new MockPaymentProvider();
  const created = provider.create({ reference: 'order_1', amountMillimes: 2000001n });
  assert.deepEqual(provider.create({ reference: 'order_1', amountMillimes: 2000001n }), created);
  assert.throws(() => provider.create({ reference: 'order_1', amountMillimes: 2000000n }));
  assert.equal(created.recipient, 'NASJ');
  assert.equal(created.provenance, 'MOCK_SIMULATION');
  assert.equal(created.amountMillimes, 2000001n);
  assert.ok(Object.isFrozen(created));
});

test('mock enforces bounded storage, valid inputs and terminal transitions', () => {
  const provider = new MockPaymentProvider(1);
  assert.throws(() => provider.create({ reference: '', amountMillimes: 1n }));
  assert.throws(() => provider.create({ reference: 'x', amountMillimes: 0n }));
  assert.throws(() => provider.create({ reference: 'x', amountMillimes: 9223372036854775808n }));
  provider.create({ reference: 'one', amountMillimes: 1n });
  assert.throws(() => provider.create({ reference: 'two', amountMillimes: 1n }));
  assert.throws(() => provider.simulate('missing', 'FUNDED'));
  const funded = provider.simulate('one', 'FUNDED');
  assert.equal(provider.simulate('one', 'FUNDED'), funded);
  assert.throws(() => provider.simulate('one', 'CANCELLED'));
  assert.equal(provider.get('one')?.status, 'FUNDED');
});
