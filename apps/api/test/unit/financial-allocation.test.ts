import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateFinancialAllocation as calculate } from '@nasj/contracts';

const input = {
  policyVersion: 1 as const,
  basis: 'GROSS' as const,
  customerPriceMillimes: 2000000n,
  materialCostMillimes: 100000n,
  otherDirectCostMillimes: 50000n,
  expectedFeeMillimes: 50000n,
  artisans: [
    { artisanId: 'a', basisPoints: 3000 },
    { artisanId: 'b', basisPoints: 2500 },
    { artisanId: 'c', basisPoints: 2000 },
  ],
};
test('multiple artisans use exact amounts and costs are deducted once', () => {
  const result = calculate(input);
  assert.deepEqual(
    result.artisans.map((a) => a.amountMillimes),
    [600000n, 500000n, 400000n],
  );
  assert.equal(result.remainingContributionMillimes, 300000n);
});
test('different approved bases change amounts deterministically', () => {
  assert.equal(calculate({ ...input, basis: 'AFTER_MATERIALS' }).baseMillimes, 1900000n);
  const result = calculate({ ...input, basis: 'AFTER_DIRECT_COSTS' });
  assert.equal(result.baseMillimes, 1850000n);
  assert.equal(result.artisans[0]?.amountMillimes, 555000n);
});
test('rejects duplicate artisans, over-allocation, excessive costs and rounding overflow', () => {
  assert.throws(() => calculate({ ...input, artisans: [input.artisans[0]!, input.artisans[0]!] }));
  assert.throws(() => calculate({ ...input, artisans: [{ artisanId: 'a', basisPoints: 10000 }] }));
  assert.throws(() => calculate({ ...input, materialCostMillimes: 2000001n }));
  assert.throws(() =>
    calculate({
      ...input,
      customerPriceMillimes: 1n,
      materialCostMillimes: 0n,
      otherDirectCostMillimes: 0n,
      expectedFeeMillimes: 0n,
      artisans: [
        { artisanId: 'a', basisPoints: 5000 },
        { artisanId: 'b', basisPoints: 5000 },
      ],
    }),
  );
});
