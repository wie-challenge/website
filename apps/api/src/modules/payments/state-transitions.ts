import { randomUUID } from 'node:crypto';
import type { PaymentObligationStatus } from '@nasj/contracts';
import type { Db } from '../foundation/transaction.js';
import { postJournalBatch } from './ledger.service.js';
import type { EscrowRecord, ProviderProvenance } from './provider.types.js';

const TERMINAL_STATES = new Set<string>(['SETTLED', 'CANCELLED', 'REFUNDED', 'FAILED']);

const STATE_RANK: Record<string, number> = {
  AWAITING_PAYMENT: 1,
  PAYMENT_PENDING: 2,
  FUNDS_SECURED: 3,
  AWAITING_DELIVERY_ACCEPTANCE: 4,
  DISPUTED: 5,
  SETTLED: 6,
  CANCELLED: 6,
  REFUNDED: 6,
  FAILED: 6,
};

export function isMonotonicTransition(current: string, next: PaymentObligationStatus): boolean {
  if (current === next) return true;
  if (TERMINAL_STATES.has(current)) return false;
  // Allow DISPUTED <-> AWAITING_DELIVERY_ACCEPTANCE only when moving to terminal resolution,
  // and allow AWAITING_DELIVERY_ACCEPTANCE -> FUNDS_SECURED on buyer reject-delivery!
  if (current === 'AWAITING_DELIVERY_ACCEPTANCE' && next === 'FUNDS_SECURED') return true;
  if (current === 'DISPUTED' && ['SETTLED', 'REFUNDED', 'CANCELLED'].includes(next)) return true;
  return (STATE_RANK[next] ?? 0) >= (STATE_RANK[current] ?? 0);
}

export async function emitPaymentOutboxEvent(
  tx: Db,
  input: {
    actorId: string;
    organizationId?: string | null;
    eventType: string;
    targetType: string;
    targetId: string;
    correlationId: string;
    reason?: string;
    after?: Record<string, unknown>;
  },
) {
  const auditRow = await tx.auditEvent.create({
    data: {
      actorId: input.actorId,
      organizationId: input.organizationId ?? null,
      action: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason ?? null,
      after: (input.after ?? {}) as never,
      correlationId: input.correlationId,
    },
  });
  await tx.outboxEvent.create({
    data: {
      id: randomUUID(),
      auditEventId: auditRow.id,
      eventType: input.eventType,
      version: 1,
      actorId: input.actorId,
      organizationId: input.organizationId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      correlationId: input.correlationId,
    },
  });
}

export async function applyEscrowSnapshot(
  tx: Db,
  input: {
    escrowId: string;
    snapshot: EscrowRecord;
    provenance: ProviderProvenance;
    actorId: string;
    correlationId: string;
    source: string;
  },
) {
  const escrow = await tx.providerEscrow.findUniqueOrThrow({
    where: { id: input.escrowId },
    include: { obligation: true },
  });
  const obligation = escrow.obligation;

  // Quarantine unknown provider statuses without altering authoritative payment status.
  if (input.snapshot.normalizedStatus === 'UNKNOWN') {
    await tx.providerEscrow.update({
      where: { id: escrow.id },
      data: {
        providerStatus: input.snapshot.rawStatus,
        lastSyncedAt: new Date(),
      },
    });
    await tx.paymentObligation.update({
      where: { id: obligation.id },
      data: { reconciliationStatus: 'DISCREPANCY_QUARANTINED' },
    });
    return { applied: false, reason: 'UNKNOWN_PROVIDER_STATUS' as const };
  }

  let nextStatus: PaymentObligationStatus = input.snapshot.normalizedStatus;
  // DHMAD maps funded cancellations to status='cancelled' with refundedTotalTnd or prior paid status.
  const wasFunded = [
    'FUNDS_SECURED',
    'AWAITING_DELIVERY_ACCEPTANCE',
    'DISPUTED',
    'SETTLED',
  ].includes(obligation.status);
  if (
    nextStatus === 'CANCELLED' &&
    (wasFunded || (input.snapshot.refundedTotalMillimes ?? 0n) > 0n)
  ) {
    nextStatus = 'REFUNDED';
  }

  if (!isMonotonicTransition(obligation.status, nextStatus)) {
    await tx.providerEscrow.update({
      where: { id: escrow.id },
      data: { lastSyncedAt: new Date() },
    });
    return { applied: false, reason: 'STALE_OUT_OF_ORDER_EVENT' as const };
  }

  // Verify amount and currency integrity against locked NASJ obligation.
  if (
    input.snapshot.amountMillimes !== obligation.amountMillimes ||
    input.snapshot.currency !== obligation.currency
  ) {
    await tx.paymentObligation.update({
      where: { id: obligation.id },
      data: { reconciliationStatus: 'DISCREPANCY_QUARANTINED' },
    });
    return { applied: false, reason: 'AMOUNT_OR_CURRENCY_MISMATCH' as const };
  }

  const feeMillimes =
    input.snapshot.escrowFeeMillimes > 0n
      ? input.snapshot.escrowFeeMillimes
      : escrow.providerFeeMillimes;

  await tx.providerEscrow.update({
    where: { id: escrow.id },
    data: {
      status: nextStatus,
      providerStatus: input.snapshot.rawStatus,
      sellerEmail: escrow.sellerEmail ?? input.snapshot.sellerEmail ?? null,
      providerFeeMillimes: feeMillimes,
      deliveredAt: input.snapshot.deliveredAt
        ? new Date(input.snapshot.deliveredAt)
        : escrow.deliveredAt,
      completionDeadline: input.snapshot.completionDeadline
        ? new Date(input.snapshot.completionDeadline)
        : escrow.completionDeadline,
      sellerSigned: input.snapshot.sellerSigned ?? escrow.sellerSigned,
      buyerSigned: input.snapshot.buyerSigned ?? escrow.buyerSigned,
      isFullySigned: input.snapshot.isFullySigned ?? escrow.isFullySigned,
      contractPdfUrl: input.snapshot.contractPdfUrl ?? escrow.contractPdfUrl,
      lastSyncedAt: new Date(),
    },
  });

  const releasedMillimes =
    nextStatus === 'SETTLED'
      ? (input.snapshot.releasedTotalMillimes ??
        (obligation.feeBearer === 'SELLER'
          ? obligation.amountMillimes - feeMillimes
          : obligation.amountMillimes))
      : obligation.releasedToNasjMillimes;

  const refundedMillimes =
    nextStatus === 'REFUNDED'
      ? (input.snapshot.refundedTotalMillimes ?? obligation.buyerFundingMillimes)
      : obligation.refundedMillimes;

  await tx.paymentObligation.update({
    where: { id: obligation.id },
    data: {
      status: nextStatus,
      actualFeeMillimes: feeMillimes,
      releasedToNasjMillimes: releasedMillimes,
      refundedMillimes,
      settledAt:
        nextStatus === 'SETTLED' ? (obligation.settledAt ?? new Date()) : obligation.settledAt,
    },
  });

  // Ensure intermediate funding journal entry exists if jumped directly to DELIVERED/SETTLED.
  if (
    ['FUNDS_SECURED', 'AWAITING_DELIVERY_ACCEPTANCE', 'SETTLED', 'DISPUTED', 'REFUNDED'].includes(
      nextStatus,
    )
  ) {
    await postJournalBatch(tx, {
      obligationId: obligation.id,
      sourceType: 'ProviderEscrow',
      sourceId: escrow.id,
      idempotencyKey: `escrow:funded:${escrow.id}`,
      description: `Buyer funds secured in escrow (${input.source})`,
      provenance: input.provenance,
      lines: [
        {
          accountCode: 'ESCROW_HELD',
          side: 'DEBIT',
          amountMillimes: obligation.buyerFundingMillimes,
        },
        {
          accountCode: 'CUSTOMER_RECEIVABLE',
          side: 'CREDIT',
          amountMillimes: obligation.buyerFundingMillimes,
        },
      ],
    });
  }

  if (nextStatus === 'SETTLED') {
    const settlementLines: {
      accountCode: 'NASJ_SETTLED_CLEARING' | 'PROVIDER_FEES_EXPENSE' | 'ESCROW_HELD';
      side: 'DEBIT' | 'CREDIT';
      amountMillimes: bigint;
    }[] = [
      { accountCode: 'NASJ_SETTLED_CLEARING', side: 'DEBIT', amountMillimes: releasedMillimes },
    ];
    if (feeMillimes > 0n) {
      settlementLines.push({
        accountCode: 'PROVIDER_FEES_EXPENSE',
        side: 'DEBIT',
        amountMillimes: feeMillimes,
      });
    }
    settlementLines.push({
      accountCode: 'ESCROW_HELD',
      side: 'CREDIT',
      amountMillimes: releasedMillimes + feeMillimes,
    });
    await postJournalBatch(tx, {
      obligationId: obligation.id,
      sourceType: 'ProviderEscrow',
      sourceId: escrow.id,
      idempotencyKey: `escrow:settled:${escrow.id}`,
      description: `Escrow released to NASJ account (${input.source})`,
      provenance: input.provenance,
      lines: settlementLines,
    });
  } else if (nextStatus === 'REFUNDED' && refundedMillimes > 0n) {
    await postJournalBatch(tx, {
      obligationId: obligation.id,
      sourceType: 'ProviderEscrow',
      sourceId: escrow.id,
      idempotencyKey: `escrow:refunded:${escrow.id}`,
      description: `Escrow refunded to buyer (${input.source})`,
      provenance: input.provenance,
      lines: [
        { accountCode: 'REFUND_LIABILITY', side: 'DEBIT', amountMillimes: refundedMillimes },
        { accountCode: 'ESCROW_HELD', side: 'CREDIT', amountMillimes: refundedMillimes },
      ],
    });
  } else if (nextStatus === 'CANCELLED' && !wasFunded) {
    await postJournalBatch(tx, {
      obligationId: obligation.id,
      sourceType: 'ProviderEscrow',
      sourceId: escrow.id,
      idempotencyKey: `escrow:cancelled:${escrow.id}`,
      description: `Unfunded escrow cancelled (${input.source})`,
      provenance: input.provenance,
      lines: [
        {
          accountCode: 'NASJ_CONTRIBUTION_RESERVE',
          side: 'DEBIT',
          amountMillimes: obligation.buyerFundingMillimes,
        },
        {
          accountCode: 'CUSTOMER_RECEIVABLE',
          side: 'CREDIT',
          amountMillimes: obligation.buyerFundingMillimes,
        },
      ],
    });
  }

  if (nextStatus === 'DISPUTED' && input.snapshot.disputeId) {
    const existingDispute = await tx.providerDispute.findFirst({
      where: { escrowId: escrow.id, externalDisputeId: input.snapshot.disputeId },
    });
    if (!existingDispute) {
      await tx.providerDispute.create({
        data: {
          obligationId: obligation.id,
          escrowId: escrow.id,
          provider: escrow.provider,
          environment: escrow.environment,
          externalDisputeId: input.snapshot.disputeId,
          ticketNumber: input.snapshot.disputeTicketNumber ?? null,
          status: 'OPEN',
          reason: 'Provider escrow dispute opened.',
        },
      });
    }
  }

  if (obligation.status !== nextStatus) {
    await emitPaymentOutboxEvent(tx, {
      actorId: input.actorId,
      organizationId: obligation.buyerOrganizationId,
      eventType: `payment.obligation.${nextStatus.toLowerCase()}`,
      targetType: 'PaymentObligation',
      targetId: obligation.id,
      correlationId: input.correlationId,
      reason: `Transition from ${obligation.status} to ${nextStatus} (${input.source})`,
      after: { status: nextStatus, providerStatus: input.snapshot.rawStatus },
    });
  }

  return { applied: true, previousStatus: obligation.status, nextStatus };
}
