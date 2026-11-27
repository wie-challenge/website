import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertOfferWithinFinancialPlan,
  guardOfferFinancialPlan,
} from '../../src/modules/commerce/financial-plan-guard.js';
import type { Db } from '../../src/modules/foundation/transaction.js';

const plan = [
  { artisanProfileId: 'a', basisPoints: 3000, amountMillimes: '600000' },
  { artisanProfileId: 'b', basisPoints: 2500, amountMillimes: '500000' },
];
test('approved compensation limits cumulative offers without marking partial terms complete', () => {
  assertOfferWithinFinancialPlan(plan, 'a', 100000n, 300000n);
  assertOfferWithinFinancialPlan(plan, 'a', 100000n, 500000n);
  assert.throws(() => assertOfferWithinFinancialPlan(plan, 'a', 100000n, 500001n));
  assert.throws(() => assertOfferWithinFinancialPlan(plan, 'missing', 0n, 1n));
  assert.throws(() =>
    assertOfferWithinFinancialPlan([{ artisanProfileId: 'a', amountMillimes: '-1' }], 'a', 0n, 1n),
  );
  assert.throws(() => assertOfferWithinFinancialPlan([...plan, plan[0]], 'a', 0n, 1n));
});
test('no snapshot preserves existing orders; snapshot reads accepted offer totals', async () => {
  let loaded = false;
  const offer = { orderId: 'order', artisanProfileId: 'a', quantity: 2, unitPayMillimes: 100000n };
  const noPlan = {
    financialPlanSnapshot: { findFirst: async () => null },
    commercialOffer: {
      findMany: async () => {
        loaded = true;
        return [];
      },
    },
  } as unknown as Db;
  await guardOfferFinancialPlan(noPlan, offer);
  assert.equal(loaded, false);
  const tx = {
    financialPlanSnapshot: { findFirst: async () => ({ allocations: plan }) },
    commercialOffer: { findMany: async () => [{ quantity: 3, unitPayMillimes: 150000n }] },
  } as unknown as Db;
  await assert.rejects(() => guardOfferFinancialPlan(tx, offer));
});
