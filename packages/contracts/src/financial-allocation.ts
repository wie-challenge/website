import { addTnd, MAX_TND_MILLIMES, prorateTnd } from './domain.js';

/** Version 1 operates on already approved quote and expense values, not pricing assumptions. */
export type AllocationBasis = 'GROSS' | 'AFTER_MATERIALS' | 'AFTER_DIRECT_COSTS';
export type AllocationInput = {
  policyVersion: 1;
  basis: AllocationBasis;
  customerPriceMillimes: bigint;
  materialCostMillimes: bigint;
  otherDirectCostMillimes: bigint;
  expectedFeeMillimes: bigint;
  artisans: readonly { artisanId: string; basisPoints: number }[];
};

/** Pure calculation only: approval, persistence, and identity authorization belong to callers. */
export function calculateFinancialAllocation(input: AllocationInput) {
  if (input.policyVersion !== 1) throw new RangeError('Unsupported allocation policy.');
  const {
    customerPriceMillimes: price,
    materialCostMillimes: materials,
    otherDirectCostMillimes: other,
    expectedFeeMillimes: fees,
  } = input;
  for (const value of [price, materials, other, fees]) {
    if (typeof value !== 'bigint' || value < 0n || value > MAX_TND_MILLIMES)
      throw new RangeError('Invalid monetary amount.');
  }
  const directCosts = addTnd(materials, other);
  const costsAndFees = addTnd(directCosts, fees);
  if (costsAndFees > price) throw new RangeError('Costs exceed customer price.');
  let base: bigint;
  switch (input.basis) {
    case 'GROSS':
      base = price;
      break;
    case 'AFTER_MATERIALS':
      base = price - materials;
      break;
    case 'AFTER_DIRECT_COSTS':
      base = price - directCosts;
      break;
    default:
      throw new RangeError('Unsupported allocation basis.');
  }
  if (!Array.isArray(input.artisans) || input.artisans.length === 0)
    throw new RangeError('At least one artisan is required.');
  const ids = new Set<string>();
  let totalBasisPoints = 0;
  let compensation = 0n;
  const artisans = input.artisans.map(({ artisanId, basisPoints }) => {
    if (
      typeof artisanId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(artisanId) ||
      ids.has(artisanId)
    )
      throw new RangeError('Invalid or duplicate artisan.');
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)
      throw new RangeError('Invalid artisan percentage.');
    ids.add(artisanId);
    totalBasisPoints += basisPoints;
    if (totalBasisPoints > 10000) throw new RangeError('Percentages exceed calculation base.');
    const amountMillimes = prorateTnd(base, BigInt(basisPoints), 10000n);
    compensation = addTnd(compensation, amountMillimes);
    return { artisanId, basisPoints, amountMillimes };
  });
  if (compensation > base || compensation > price - costsAndFees)
    throw new RangeError('Allocation exceeds available funds.');
  return {
    policyVersion: 1 as const,
    basis: input.basis,
    baseMillimes: base,
    artisans,
    directCostsMillimes: directCosts,
    expectedFeeMillimes: fees,
    totalCompensationMillimes: compensation,
    remainingContributionMillimes: price - costsAndFees - compensation,
  };
}
