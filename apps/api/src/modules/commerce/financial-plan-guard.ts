import { requireRule } from '@nasj/contracts';
import type { Db } from '../foundation/transaction.js';

// This is an upper bound only. A partial allocation is not a completed agreement.
export function assertOfferWithinFinancialPlan(
  allocations: unknown,
  artisanId: string,
  previouslyAccepted: bigint,
  proposed: bigint,
) {
  requireRule(Array.isArray(allocations), 'FINANCIAL_PLAN_INVALID', 'Financial plan is invalid.');
  const matching = allocations.filter(
    (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'artisanProfileId' in entry &&
      entry.artisanProfileId === artisanId,
  );
  requireRule(
    matching.length === 1,
    'ARTISAN_NOT_IN_FINANCIAL_PLAN',
    'This artisan is not in the approved financial plan.',
  );
  const amount: unknown = matching[0]?.amountMillimes;
  requireRule(
    typeof amount === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(amount),
    'FINANCIAL_PLAN_INVALID',
    'Financial plan is invalid.',
  );
  requireRule(
    previouslyAccepted >= 0n && proposed > 0n && previouslyAccepted + proposed <= BigInt(amount),
    'FINANCIAL_PLAN_COMPENSATION_EXCEEDED',
    'Accepted compensation would exceed the approved artisan allocation.',
  );
}

export async function guardOfferFinancialPlan(
  tx: Db,
  offer: { orderId: string; artisanProfileId: string; quantity: number; unitPayMillimes: bigint },
) {
  const snapshot = await tx.financialPlanSnapshot.findFirst({
    where: { acceptance: { orderId: offer.orderId } },
    orderBy: { revision: 'desc' },
    select: { allocations: true },
  });
  if (!snapshot) return;
  const accepted = await tx.commercialOffer.findMany({
    where: { orderId: offer.orderId, artisanProfileId: offer.artisanProfileId, status: 'ACCEPTED' },
    select: { quantity: true, unitPayMillimes: true },
  });
  const previous = accepted.reduce(
    (sum, row) => sum + BigInt(row.quantity) * row.unitPayMillimes,
    0n,
  );
  assertOfferWithinFinancialPlan(
    snapshot.allocations,
    offer.artisanProfileId,
    previous,
    BigInt(offer.quantity) * offer.unitPayMillimes,
  );
}
