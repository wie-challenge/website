import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import { z } from 'zod';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const depositView = (row: {
  expectedMillimes: bigint;
  amountMillimes: bigint;
  [key: string]: unknown;
}) => {
  const { expectedMillimes, ...rest } = row;
  return { ...view(rest), expectedTnd: C.formatTnd(expectedMillimes) };
};
const payableView = <T extends { amountMillimes: bigint; unitPayMillimes: bigint }>(row: T) => {
  const { unitPayMillimes, ...rest } = row;
  return { ...view(rest), unitPayTnd: C.formatTnd(unitPayMillimes) };
};
const view = <T extends { amountMillimes: bigint }>(row: T) => {
  const { amountMillimes, ...rest } = row;
  return { ...rest, amountTnd: C.formatTnd(amountMillimes), currency: 'TND' as const };
};
@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async access(tx: Db, actor: Actor, orderId: string, permission?: C.Permission) {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      include: { rfq: true, acceptance: { include: { quote: true } } },
    });
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organizationId: { in: [order.rfq.operatorOrganizationId, order.rfq.buyerOrganizationId] },
        organization: { approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    const internal = members.find(
      (m) =>
        m.organizationId === order.rfq.operatorOrganizationId && m.organization.type === 'INTERNAL',
    );
    const permissions = internal ? C.permissionsForMembership(internal) : [];
    const assigned = internal
      ? await tx.operatorAssignment.findFirst({
          where: {
            operatorId: actor.id,
            organizationId: order.rfq.buyerOrganizationId,
            revokedAt: null,
          },
        })
      : null;
    const buyer = members.some(
      (m) =>
        m.organizationId === order.rfq.buyerOrganizationId &&
        m.organization.type === 'BUYER_BUSINESS',
    );
    const finance = Boolean(
      assigned &&
        (permissions.includes('finance.payout.read') ||
          permissions.includes('operator.accounts.read')),
    );
    if (permission ? !assigned || !permissions.includes(permission) : !finance && !buyer)
      fail(404, 'NOT_FOUND', 'Order not found or required scoped permission unavailable.');
    return { order, permissions: assigned ? permissions : [], finance, buyer };
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    id: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    fn: () => Promise<T>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId: id, operation: `finance.${operation}`, key },
      json(input),
      fn,
    );
  }
  private async event(
    tx: Db,
    actor: Actor,
    type: string,
    id: string,
    status: string,
    reason: string,
  ) {
    await tx.financeRecordEvent.create({
      data: { targetId: id, targetType: type, actorId: actor.id, status, reason },
    });
    await audit(tx, actor, {
      action: `finance.${type}.${status.toLowerCase()}`,
      targetType: type,
      targetId: id,
      reason,
      after: { status, bankVerified: false },
    });
  }
  async workspace(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId);
      const deposits = await tx.buyerDepositRecord.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      if (!a.finance)
        return {
          orderId,
          organizationId: a.order.rfq.buyerOrganizationId,
          permissions: a.permissions,
          expectedTnd: C.formatTnd(a.order.acceptance?.quote.totalMillimes ?? 0n),
          deposits: deposits.map(depositView),
          payables: [],
          payouts: [],
          disputes: [],
          adjustments: [],
          closure: { status: 'BLOCKED', blockers: ['BANK_EVIDENCE_UNAVAILABLE'] },
        };
      const [payables, payouts, disputes, adjustments, events] = await Promise.all([
        tx.artisanPayable.findMany({ where: { orderId } }),
        tx.payoutRequest.findMany({ where: { orderId } }),
        tx.paymentDispute.findMany({ where: { orderId } }),
        tx.financialAdjustment.findMany({ where: { orderId } }),
        tx.financeRecordEvent.findMany({
          where: { targetId: { in: [orderId, ...deposits.map((d) => d.id)] } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
      ]);
      const executions = await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      });
      return {
        orderId,
        organizationId: a.order.rfq.operatorOrganizationId,
        permissions: a.permissions,
        delivered: a.order.delivered,
        expectedTnd: C.formatTnd(a.order.acceptance?.quote.totalMillimes ?? 0n),
        deposits: deposits.map(depositView),
        payables: payables.map(payableView),
        payouts: payouts.map((p) => ({
          ...view(p),
          payableSnapshotMillimes: undefined,
          payableSnapshotTnd: C.formatTnd(p.payableSnapshotMillimes),
          executions: executions.filter((e) => e.payoutId === p.id).map(view),
        })),
        disputes: disputes.map(view),
        adjustments: adjustments.map(view),
        events: [
          ...events,
          ...(await tx.financeRecordEvent.findMany({
            where: {
              targetId: {
                in: [
                  ...payouts.map((p) => p.id),
                  ...executions.map((e) => e.id),
                  ...disputes.map((d) => d.id),
                  ...adjustments.map((a) => a.id),
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          })),
        ],
        closure: await this.assess(tx, orderId),
      };
    });
  }
  async deposit(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.depositRecordSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId, 'finance.deposit.record');
      return this.command(tx, actor, orderId, 'deposit.record', key, input, async () => {
        if (new Date(input.paymentDate) > new Date())
          fail(400, 'INVALID_DATE', 'Payment date cannot be in the future.');
        const reference = input.paymentReference.trim().toUpperCase();
        if (
          await tx.buyerDepositRecord.findUnique({
            where: {
              buyerOrganizationId_paymentReference: {
                buyerOrganizationId: a.order.rfq.buyerOrganizationId,
                paymentReference: reference,
              },
            },
          })
        )
          fail(
            409,
            'DUPLICATE_PAYMENT_REFERENCE',
            'This buyer payment reference has already been reported.',
          );
        const row = await tx.buyerDepositRecord.create({
          data: {
            orderId,
            buyerOrganizationId: a.order.rfq.buyerOrganizationId,
            expectedMillimes: a.order.acceptance?.quote.totalMillimes ?? 0n,
            amountMillimes: C.parseTnd(input.amountTnd),
            paymentReference: reference,
            paymentDate: new Date(input.paymentDate),
            evidence: input.evidence,
            provenance: input.provenance,
            actorId: actor.id,
          },
        });
        await this.event(
          tx,
          actor,
          'BuyerDepositRecord',
          row.id,
          row.status,
          'Operator evidence is pending independent verification.',
        );
        const aggregate = await tx.buyerDepositRecord.aggregate({
          where: { orderId, status: { not: 'REJECTED' } },
          _sum: { amountMillimes: true },
        });
        return json({
          ...view(row),
          expectedMillimes: undefined,
          expectedTnd: C.formatTnd(row.expectedMillimes),
          coverage:
            (aggregate._sum.amountMillimes ?? 0n) < row.expectedMillimes
              ? 'PARTIAL'
              : (aggregate._sum.amountMillimes ?? 0n) > row.expectedMillimes
                ? 'OVERPAYMENT_REVIEW'
                : 'CLAIMED_FULL',
          bankVerified: false,
        });
      });
    });
  }
  async reviewDeposit(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.depositReviewSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.buyerDepositRecord.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Deposit not found.');
      await this.access(tx, actor, row.orderId, 'finance.deposit.review');
      return this.command(tx, actor, id, 'deposit.review', key, input, async () => {
        C.assertIndependentApproval(row.actorId, actor.id);
        const saved = await tx.buyerDepositRecord.update({
          where: { id },
          data: { status: input.decision, reviewerId: actor.id, reason: input.reason },
        });
        await this.event(tx, actor, 'BuyerDepositRecord', id, saved.status, input.reason);
        return json(depositView(saved));
      });
    });
  }
  private async noDisputes(tx: Db, payable: { id: string; batchId: string }) {
    if (
      await tx.paymentDispute.count({
        where: { batchId: payable.batchId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      })
    )
      fail(
        409,
        'OPEN_PAYMENT_DISPUTE',
        'Payout is blocked until the artisan claim receives an audited resolution.',
      );
  }
  async requestPayout(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.payoutRequestSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.payout.request');
      return this.command(tx, actor, orderId, 'payout.request', key, input, async () => {
        const payable = await tx.artisanPayable.findUnique({ where: { id: input.payableId } });
        if (!payable || payable.orderId !== orderId) fail(404, 'NOT_FOUND', 'Payable not found.');
        await this.noDisputes(tx, payable);
        if (payable.status !== 'RECOGNIZED')
          fail(409, 'PAYABLE_INELIGIBLE', 'Payable is not eligible.');
        const held = await tx.payoutRequest.aggregate({
          where: { payableId: payable.id, status: { not: 'FAILED' } },
          _sum: { amountMillimes: true },
        });
        const amount = C.parseTnd(input.amountTnd);
        C.assertPayoutCapacity(payable.amountMillimes, held._sum.amountMillimes ?? 0n, amount);
        const row = await tx.payoutRequest.create({
          data: {
            orderId,
            payableId: payable.id,
            amountMillimes: amount,
            payableSnapshotMillimes: payable.amountMillimes,
            requesterId: actor.id,
            reason: input.reason,
          },
        });
        await this.event(tx, actor, 'PayoutRequest', row.id, row.status, input.reason);
        return json(view(row));
      });
    });
  }
  async approvePayout(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.payoutRequest.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Payout not found.');
      await this.access(tx, actor, row.orderId, 'finance.payout.approve');
      return this.command(tx, actor, id, 'payout.approve', key, input, async () => {
        C.assertIndependentApproval(row.requesterId, actor.id);
        if (row.status !== 'REQUESTED')
          fail(409, 'INVALID_TRANSITION', 'Only a requested payout can be approved.');
        const payable = await tx.artisanPayable.findUniqueOrThrow({ where: { id: row.payableId } });
        await this.noDisputes(tx, payable);
        if (
          payable.amountMillimes !== row.payableSnapshotMillimes ||
          payable.status !== 'RECOGNIZED'
        )
          fail(409, 'PAYABLE_CHANGED', 'Payable changed after the request; review a new request.');
        const held = await tx.payoutRequest.aggregate({
          where: { payableId: row.payableId, status: { not: 'FAILED' }, id: { not: id } },
          _sum: { amountMillimes: true },
        });
        C.assertPayoutCapacity(
          payable.amountMillimes,
          held._sum.amountMillimes ?? 0n,
          row.amountMillimes,
        );
        const saved = await tx.payoutRequest.update({
          where: { id },
          data: { status: 'APPROVED', approverId: actor.id, approvedAt: new Date() },
        });
        await this.event(tx, actor, 'PayoutRequest', id, saved.status, input.reason);
        return json(view(saved));
      });
    });
  }
  async execution(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.payoutExecutionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.payoutRequest.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Payout not found.');
      await this.access(tx, actor, row.orderId, 'finance.payout.execute');
      return this.command(tx, actor, id, 'payout.execution', key, input, async () => {
        if (!['APPROVED', 'EXECUTION_PENDING', 'VERIFICATION_PENDING'].includes(row.status))
          fail(409, 'INVALID_TRANSITION', 'Execution requires independent payout approval.');
        if (
          !row.approverId ||
          !row.approvedAt ||
          row.approverId === row.requesterId ||
          row.policyVersion !== 1
        )
          fail(409, 'INVALID_APPROVAL', 'A valid independent approval is required.');
        const payable = await tx.artisanPayable.findUniqueOrThrow({ where: { id: row.payableId } });
        await this.noDisputes(tx, payable);
        if (
          payable.amountMillimes !== row.payableSnapshotMillimes ||
          payable.status !== 'RECOGNIZED'
        )
          fail(409, 'PAYABLE_CHANGED', 'Payable changed after approval.');
        if (new Date(input.occurredAt) > new Date())
          fail(400, 'INVALID_DATE', 'Execution date cannot be in the future.');
        const prior = await tx.payoutExecutionRecord.aggregate({
          where: { payoutId: id, status: 'VERIFICATION_PENDING' },
          _sum: { amountMillimes: true },
        });
        const amount = C.parseTnd(input.amountTnd);
        C.assertPayoutCapacity(row.amountMillimes, prior._sum.amountMillimes ?? 0n, amount);
        const status = input.outcome === 'FAILED' ? 'FAILED' : 'VERIFICATION_PENDING';
        const saved = await tx.payoutExecutionRecord.create({
          data: {
            payoutId: id,
            amountMillimes: amount,
            reference: input.reference,
            evidence: input.evidence,
            occurredAt: new Date(input.occurredAt),
            actorId: actor.id,
            status,
            bankVerified: false,
          },
        });
        await tx.payoutRequest.update({
          where: { id },
          data: {
            status:
              (prior._sum.amountMillimes ?? 0n) > 0n || status === 'VERIFICATION_PENDING'
                ? 'VERIFICATION_PENDING'
                : 'EXECUTION_PENDING',
          },
        });
        await this.event(
          tx,
          actor,
          'PayoutExecutionRecord',
          saved.id,
          status,
          `Manual execution evidence is unverified. ${input.evidence}`,
        );
        return json({ ...view(saved), paidVerifiedTnd: '0.000' });
      });
    });
  }
  private async claim(tx: Db, actor: Actor, batchId: string) {
    const batch = await tx.commercialBatch.findUnique({
      where: { id: batchId },
      include: { artisanProfile: true, offer: true },
    });
    if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
    return { batch, own: batch.artisanProfile.userId === actor.id };
  }
  async dispute(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.paymentDisputeSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const c = await this.claim(tx, actor, input.batchId);
      if (c.batch.orderId !== orderId) fail(404, 'NOT_FOUND', 'Batch not found.');
      if (!c.own)
        fail(
          403,
          'ASSISTED_REPORTING_UNAPPROVED',
          'Only the authenticated artisan can lodge this claim; assisted financial reporting has no approved policy.',
        );
      return this.command(tx, actor, orderId, 'dispute.raise', key, input, async () => {
        if (input.payableId) {
          const p = await tx.artisanPayable.findUnique({ where: { id: input.payableId } });
          if (!p || p.batchId !== input.batchId) fail(404, 'NOT_FOUND', 'Payable not found.');
        }
        const row = await tx.paymentDispute.create({
          data: {
            orderId,
            batchId: input.batchId,
            payableId: input.payableId,
            artisanProfileId: c.batch.artisanProfileId,
            amountMillimes: C.parseTnd(input.amountTnd),
            reason: input.reason,
            description: input.description,
            evidence: input.evidence,
            actorId: actor.id,
            responseDueAt: new Date(Date.now() + 7 * 86400_000),
          },
        });
        await this.event(tx, actor, 'PaymentDispute', row.id, 'OPEN', input.reason);
        return json(view(row));
      });
    });
  }
  async reviewDispute(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.disputeReviewSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.paymentDispute.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Dispute not found.');
      const c = await this.claim(tx, actor, row.batchId);
      if (!['RESOLVED', 'CLOSED'].includes(input.status))
        await this.access(tx, actor, row.orderId, 'finance.dispute.manage');
      else if (!c.own)
        fail(
          403,
          'CLAIMANT_CONFIRMATION_REQUIRED',
          'The claimant must accept the proposed resolution.',
        );
      return this.command(tx, actor, id, 'dispute.review', key, input, async () => {
        C.assertDisputeTransition(row.status, input.status, c.own);
        const saved = await tx.paymentDispute.update({
          where: { id },
          data: { status: input.status, ...(!c.own ? { handlerId: actor.id } : {}) },
        });
        await this.event(tx, actor, 'PaymentDispute', id, input.status, input.reason);
        return json(view(saved));
      });
    });
  }
  async adjustment(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.adjustmentProposalSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.adjustment.propose');
      return this.command(tx, actor, orderId, 'adjustment.propose', key, input, async () => {
        const snapshot = await this.snapshot(tx, orderId);
        const row = await tx.financialAdjustment.create({
          data: {
            orderId,
            amountMillimes: C.parseTnd(input.amountTnd),
            kind: input.kind,
            reason: input.reason,
            makerId: actor.id,
            direction: input.direction,
            evidence: input.evidence ?? input.reason,
            snapshot: json(snapshot),
          },
        });
        await this.event(tx, actor, 'FinancialAdjustment', row.id, row.status, input.reason);
        return json({ ...view(row), effect: 'PROPOSED_ONLY_OBLIGATIONS_PRESERVED' });
      });
    });
  }
  async approveAdjustment(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.financialAdjustment.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Adjustment not found.');
      await this.access(tx, actor, row.orderId, 'finance.adjustment.approve');
      return this.command(tx, actor, id, 'adjustment.approve', key, input, async () => {
        C.assertIndependentApproval(row.makerId, actor.id);
        if (row.status !== 'PENDING_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'Adjustment already reviewed.');
        const saved = await tx.financialAdjustment.update({
          where: { id },
          data: { status: 'APPROVED_PENDING_POLICY', checkerId: actor.id },
        });
        await this.event(tx, actor, 'FinancialAdjustment', id, saved.status, input.reason);
        return json({
          ...view(saved),
          effect: 'PENDING_COMPENSATION_POLICY_OBLIGATIONS_PRESERVED',
        });
      });
    });
  }
  async statement(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batches = await tx.commercialBatch.findMany({
        where: { artisanProfile: { userId: actor.id } },
        include: { offer: true, payables: true },
      });
      const disputes = await tx.paymentDispute.findMany({
        where: { batchId: { in: batches.map((b) => b.id) } },
      });
      const payouts = await tx.payoutRequest.findMany({
        where: { payableId: { in: batches.flatMap((b) => b.payables.map((p) => p.id)) } },
      });
      const executions = await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      });
      const events = await tx.financeRecordEvent.findMany({
        where: { targetId: { in: disputes.map((d) => d.id) } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        items: batches.map((b) => ({
          orderId: b.orderId,
          batchId: b.id,
          agreedTnd: C.formatTnd(b.offer.unitPayMillimes * BigInt(b.offer.quantity)),
          earnedTnd: C.formatTnd(b.payables.reduce((s, p) => s + p.amountMillimes, 0n)),
          payableTnd: C.formatTnd(b.payables.reduce((s, p) => s + p.amountMillimes, 0n)),
          paidVerifiedTnd: '0.000',
          payables: b.payables.map(payableView),
          disputes: disputes
            .filter((d) => d.batchId === b.id)
            .map((d) => ({ ...view(d), history: events.filter((e) => e.targetId === d.id) })),
          payouts: payouts
            .filter((p) => b.payables.some((q) => q.id === p.payableId))
            .map((p) => ({
              ...view(p),
              payableSnapshotMillimes: undefined,
              executions: executions.filter((e) => e.payoutId === p.id).map(view),
            })),
        })),
      };
    });
  }
  private async snapshot(tx: Db, orderId: string) {
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        batches: { include: { offer: true, materialRequirements: true } },
        shipments: { include: { buyerConfirmation: true } },
        payables: true,
      },
    });
    const batchIds = order.batches.map((b) => b.id);
    const payouts = await tx.payoutRequest.findMany({ where: { orderId } });
    const custody = await tx.materialHandover.findMany({ where: { batchId: { in: batchIds } } });
    return json({
      orderId,
      status: order.status,
      delivered: order.delivered,
      materialsResolved: order.materialsResolved,
      batches: order.batches.map((b) => ({
        id: b.id,
        produced: b.produced,
        approved: b.approved,
        rejected: b.rejected,
        acceptedQuantity: b.offer.quantity,
        unitPayTnd: C.formatTnd(b.offer.unitPayMillimes),
        paymentTerms: b.offer.paymentConditions,
        termsSha256: b.offer.termsSha256,
        materialRequirements: b.materialRequirements,
      })),
      confirmations: order.shipments.map((s) => ({
        shipmentId: s.id,
        status: s.status,
        confirmation: s.buyerConfirmation,
      })),
      payables: order.payables.map(payableView),
      payouts: payouts.map((p) => ({
        ...view(p),
        payableSnapshotMillimes: undefined,
        payableSnapshotTnd: C.formatTnd(p.payableSnapshotMillimes),
      })),
      executions: (
        await tx.payoutExecutionRecord.findMany({
          where: { payoutId: { in: payouts.map((p) => p.id) } },
        })
      ).map(view),
      deposits: (await tx.buyerDepositRecord.findMany({ where: { orderId } })).map(depositView),
      disputes: (
        await tx.paymentDispute.findMany({
          where: { orderId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        })
      ).map(view),
      adjustments: (
        await tx.financialAdjustment.findMany({
          where: { orderId },
          select: { id: true, kind: true, direction: true, status: true, amountMillimes: true },
        })
      ).map(view),
      materialReadiness: await tx.materialReadiness.findMany({
        where: { batchId: { in: batchIds } },
      }),
      reservations: await tx.materialReservation.findMany({ where: { batchId: { in: batchIds } } }),
      custody,
      returns: await tx.materialReturn.findMany({
        where: { handoverId: { in: custody.map((h) => h.id) } },
      }),
      policyVersions: {
        payoutApproval: 1,
        compensationEntitlement: null,
        stockVerification: null,
        bankVerification: null,
        taxInvoice: null,
      },
      verifiedPaidTnd: '0.000',
      materialCostStatus: 'UNAVAILABLE_REQUIRES_POLICY',
    });
  }
  private async assess(tx: Db, orderId: string) {
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        rfq: true,
        batches: true,
        shipments: { include: { buyerConfirmation: true } },
        payables: true,
      },
    });
    const [disputes, adjustments, payouts] = await Promise.all([
      tx.paymentDispute.count({ where: { orderId, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      tx.financialAdjustment.count({ where: { orderId } }),
      tx.payoutRequest.count({ where: { orderId, status: { not: 'FAILED' } } }),
    ]);
    const accepted = order.shipments.reduce((s, r) => s + (r.buyerConfirmation?.accepted ?? 0), 0);
    const blockers = [
      'BUYER_BANK_EVIDENCE_UNAVAILABLE',
      'PAYOUT_PROVIDER_VERIFICATION_UNAVAILABLE',
      'TAX_INVOICE_POLICY_UNAPPROVED',
    ];
    if (
      accepted < order.rfq.quantity ||
      order.shipments.some((s) => s.status === 'DISCREPANCY' || !s.buyerConfirmation)
    )
      blockers.push('DELIVERY_RECONCILIATION_INCOMPLETE');
    if (order.payables.some((p) => p.amountMillimes > 0n))
      blockers.push('ARTISAN_PAYABLES_OUTSTANDING');
    if (
      order.batches.some(
        (batch) =>
          batch.produced >
          order.payables
            .filter((payable) => payable.batchId === batch.id)
            .reduce((sum, payable) => sum + payable.quantity, 0),
      ) ||
      (order.status === 'CANCELLED' && order.batches.length > 0)
    )
      blockers.push('COMPENSATION_ENTITLEMENT_REVIEW_REQUIRED');
    if (disputes) blockers.push('OPEN_PAYMENT_DISPUTES');
    if (payouts) blockers.push('PAYOUTS_UNVERIFIED');
    if (adjustments || order.status === 'CANCELLED')
      blockers.push('SETTLEMENT_POLICY_REVIEW_REQUIRED');
    const batchIds = order.batches.map((b) => b.id);
    const custody = await tx.materialHandover.findMany({ where: { batchId: { in: batchIds } } });
    const reservations = await tx.materialReservation.count({
      where: { batchId: { in: batchIds }, remainingMilli: { gt: 0 } },
    });
    const returns = await tx.materialReturn.count({
      where: { handoverId: { in: custody.map((h) => h.id) }, disposition: 'AWAITING_INSPECTION' },
    });
    const materialReadiness = await tx.materialReadiness.findMany({
      where: { batchId: { in: batchIds } },
    });
    if (
      materialReadiness.some((r) =>
        [
          'RECEIPT_INCOMPLETE',
          'DISCREPANCY_BLOCKED',
          'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION',
        ].includes(r.readiness),
      )
    )
      blockers.push('MATERIAL_READINESS_REVIEW_REQUIRED');
    const receipts = await tx.materialReceipt.findMany({
      where: { handoverId: { in: custody.map((h) => h.id) } },
    });
    if (custody.length) blockers.push('PHYSICAL_STOCK_VERIFICATION_UNAVAILABLE');
    if (
      !order.materialsResolved ||
      reservations ||
      returns ||
      custody.some((h) => {
        const receipt = receipts.find((r) => r.handoverId === h.id);
        return (
          !['RECEIVED_CONFIRMED', 'DISCREPANCY_RECONCILED'].includes(h.status) ||
          !receipt ||
          receipt.receivedMilli - receipt.damagedMilli > h.consumedMilli + h.returnedMilli
        );
      })
    )
      blockers.push('MATERIAL_LIABILITIES_UNRESOLVED');
    return {
      status: 'BLOCKED',
      blockers,
      buyerAcceptedQuantity: accepted,
      paidVerifiedTnd: '0.000',
    };
  }
  async closure(actor: Actor, orderId: string, persist = false, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(
        tx,
        actor,
        orderId,
        persist ? 'finance.closure.assess' : undefined,
      );
      if (!access.finance && !persist)
        fail(404, 'NOT_FOUND', 'Financial closure requires scoped finance access.');
      if (!persist) return this.assess(tx, orderId);
      return this.command(tx, actor, orderId, 'closure.assess', key, {}, async () => {
        const result = await this.assess(tx, orderId);
        const row = await tx.orderClosureAssessment.create({
          data: {
            orderId,
            actorId: actor.id,
            status: result.status,
            blockers: result.blockers,
            snapshot: await this.snapshot(tx, orderId),
          },
        });
        await this.event(
          tx,
          actor,
          'OrderClosureAssessment',
          row.id,
          result.status,
          result.blockers.join(', '),
        );
        return { ...result, id: row.id };
      });
    });
  }
}
