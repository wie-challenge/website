import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { fail } from '../../common/errors.js';
import type { Actor } from '../../common/identity.js';
import { PrismaService } from '../../database/prisma.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { getTrialBalance } from './ledger.service.js';
import { PaymentProviderRegistry } from './provider.factory.js';
import { ProviderError } from './provider.types.js';
import { applyEscrowSnapshot, emitPaymentOutboxEvent } from './state-transitions.js';

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PaymentProviderRegistry) private readonly registry: PaymentProviderRegistry,
  ) {}

  private async requireFinance(
    tx: Db,
    actor: Actor,
    permission: C.Permission = 'finance.payout.read',
  ) {
    const member = await tx.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member || !C.permissionsForMembership(member).includes(permission)) {
      fail(404, 'NOT_FOUND', 'Scoped finance permission required.');
    }
    return member;
  }

  async run(actor?: Actor, limit = 50) {
    const provider = this.registry.getProvider();
    let triggeredById: string | null = null;
    if (actor) {
      await iamTransaction(this.db, actor, async (tx) => {
        await this.requireFinance(tx, actor, 'finance.payable.reconcile');
        triggeredById = actor.id;
      });
    }

    const run = await this.db.reconciliationRun.create({
      data: {
        provider: provider.name,
        environment: provider.environment,
        triggeredById,
        status: 'RUNNING',
      },
    });

    let checkedCount = 0;
    let matchedCount = 0;
    let discrepancyCount = 0;

    // 1. Recover any ambiguous escrow creation operations before checking active escrows.
    const ambiguousOps = await this.db.providerOperation.findMany({
      where: {
        operationType: 'CREATE_ESCROW',
        status: 'AMBIGUOUS_QUARANTINED',
      },
      include: { obligation: { include: { escrow: true } } },
      take: 20,
    });

    if (ambiguousOps.length > 0) {
      try {
        const providerEscrows = await provider.listEscrows({ page: 1, limit: 100 });
        for (const op of ambiguousOps) {
          const escrow = op.obligation.escrow;
          if (!escrow) continue;
          const match = providerEscrows.find(
            (e) =>
              (e.externalReference && e.externalReference === escrow.externalReference) ||
              (e.title.includes(escrow.externalReference) &&
                e.amountMillimes === escrow.amountMillimes &&
                e.buyerEmail?.toLowerCase() === escrow.buyerEmail.toLowerCase()),
          );
          if (match) {
            await this.db.$transaction(async (tx) => {
              await tx.providerEscrow.update({
                where: { id: escrow.id },
                data: { externalEscrowId: match.externalEscrowId, lastSyncedAt: new Date() },
              });
              await tx.providerOperation.update({
                where: { id: op.id },
                data: {
                  status: 'SUCCEEDED',
                  responseSummary: { recoveredEscrowId: match.externalEscrowId },
                },
              });
              await applyEscrowSnapshot(tx, {
                escrowId: escrow.id,
                snapshot: match,
                provenance: provider.provenance,
                actorId: op.obligation.createdById,
                correlationId: `reconcile:${run.id}`,
                source: 'reconciliation_recovery',
              });
            });
          } else {
            discrepancyCount++;
            await this.recordDiscrepancy(
              run.id,
              op.obligationId,
              'AMBIGUOUS_CREATE_UNRESOLVED',
              'HIGH',
              { operationId: op.id, externalReference: escrow.externalReference },
            );
          }
        }
      } catch (error) {
        if (error instanceof ProviderError && error.category === 'RATE_LIMITED') {
          await this.db.reconciliationRun.update({
            where: { id: run.id },
            data: {
              status: 'RATE_LIMITED',
              completedAt: new Date(),
              summary: { message: 'Paused due to provider rate limit.' },
            },
          });
          return this.db.reconciliationRun.findUniqueOrThrow({ where: { id: run.id } });
        }
      }
    }

    // 2. Reconcile active and recently settled escrows (bounded batch).
    const escrows = await this.db.providerEscrow.findMany({
      where: {
        provider: provider.name,
        environment: provider.environment,
        externalEscrowId: { not: null },
      },
      include: { obligation: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 50),
    });

    for (const escrow of escrows) {
      checkedCount++;
      const extId = escrow.externalEscrowId!;
      try {
        const remote = await provider.getEscrow(extId);
        const issues: { kind: string; severity: string; details: Record<string, unknown> }[] = [];

        if (remote.normalizedStatus === 'UNKNOWN') {
          issues.push({
            kind: 'UNKNOWN_PROVIDER_STATUS',
            severity: 'CRITICAL',
            details: { rawStatus: remote.rawStatus },
          });
        }
        if (remote.amountMillimes !== escrow.obligation.amountMillimes) {
          issues.push({
            kind: 'AMOUNT_MISMATCH',
            severity: 'CRITICAL',
            details: {
              expected: escrow.obligation.amountMillimes.toString(),
              actual: remote.amountMillimes.toString(),
            },
          });
        }
        if (remote.currency !== escrow.obligation.currency) {
          issues.push({
            kind: 'CURRENCY_MISMATCH',
            severity: 'CRITICAL',
            details: { expected: escrow.obligation.currency, actual: remote.currency },
          });
        }
        if (
          escrow.sellerEmail &&
          remote.sellerEmail &&
          remote.sellerEmail.toLowerCase() !== escrow.sellerEmail.toLowerCase()
        ) {
          issues.push({
            kind: 'RECIPIENT_MISMATCH',
            severity: 'CRITICAL',
            details: { expected: escrow.sellerEmail, actual: remote.sellerEmail },
          });
        }
        if (
          remote.normalizedStatus === 'SETTLED' &&
          remote.releasedTotalMillimes !== undefined &&
          remote.releasedTotalMillimes + remote.escrowFeeMillimes !==
            escrow.obligation.buyerFundingMillimes
        ) {
          issues.push({
            kind: 'SETTLEMENT_MISMATCH',
            severity: 'HIGH',
            details: {
              buyerFunding: escrow.obligation.buyerFundingMillimes.toString(),
              released: remote.releasedTotalMillimes.toString(),
              fee: remote.escrowFeeMillimes.toString(),
            },
          });
        }

        const ledgerCheck = await this.db.$transaction(async (tx) => {
          const tb = await getTrialBalance(tx, escrow.obligationId);
          if (!issues.length && remote.normalizedStatus !== 'UNKNOWN') {
            await applyEscrowSnapshot(tx, {
              escrowId: escrow.id,
              snapshot: remote,
              provenance: provider.provenance,
              actorId: triggeredById ?? escrow.obligation.createdById,
              correlationId: `reconcile:${run.id}`,
              source: 'reconciliation',
            });
          }
          return tb;
        });

        if (!ledgerCheck.balanced) {
          issues.push({
            kind: 'UNBALANCED_LEDGER',
            severity: 'CRITICAL',
            details: {
              debits: ledgerCheck.totalDebitsMillimes.toString(),
              credits: ledgerCheck.totalCreditsMillimes.toString(),
            },
          });
        }

        if (issues.length > 0) {
          discrepancyCount += issues.length;
          await this.db.paymentObligation.update({
            where: { id: escrow.obligationId },
            data: { reconciliationStatus: 'DISCREPANCY_QUARANTINED' },
          });
          for (const issue of issues) {
            await this.recordDiscrepancy(
              run.id,
              escrow.obligationId,
              issue.kind,
              issue.severity,
              issue.details,
            );
          }
        } else {
          matchedCount++;
          await this.db.paymentObligation.update({
            where: { id: escrow.obligationId },
            data: { reconciliationStatus: 'MATCHED' },
          });
        }
      } catch (error) {
        if (error instanceof ProviderError && error.category === 'RATE_LIMITED') {
          break;
        }
        discrepancyCount++;
        await this.recordDiscrepancy(
          run.id,
          escrow.obligationId,
          'PROVIDER_LOOKUP_FAILED',
          'MEDIUM',
          { message: error instanceof Error ? error.message : 'Lookup failed' },
        );
      }
    }

    return this.db.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        checkedCount,
        matchedCount,
        discrepancyCount,
        completedAt: new Date(),
        summary: { checkedCount, matchedCount, discrepancyCount },
      },
      include: { discrepancies: true },
    });
  }

  private async recordDiscrepancy(
    runId: string,
    obligationId: string,
    kind: string,
    severity: string,
    details: Record<string, unknown>,
  ) {
    return this.db.reconciliationDiscrepancy.create({
      data: {
        runId,
        obligationId,
        kind,
        severity,
        status: 'OPEN',
        details: details as never,
      },
    });
  }

  async listRuns(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.requireFinance(tx, actor, 'finance.payout.read');
      return tx.reconciliationRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 30,
        include: { discrepancies: true },
      });
    });
  }

  async listDiscrepancies(actor: Actor, status?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.requireFinance(tx, actor, 'finance.payout.read');
      return tx.reconciliationDiscrepancy.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async resolveDiscrepancy(
    actor: Actor,
    id: string,
    input: { resolution: 'ACKNOWLEDGED' | 'RESOLVED'; note: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.requireFinance(tx, actor, 'finance.payable.reconcile');
      const row = await tx.reconciliationDiscrepancy.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Discrepancy not found.');
      const updated = await tx.reconciliationDiscrepancy.update({
        where: { id },
        data: {
          status: input.resolution,
          resolvedById: actor.id,
          resolutionNote: input.note,
          resolvedAt: new Date(),
        },
      });
      if (row.obligationId && input.resolution === 'RESOLVED') {
        const remaining = await tx.reconciliationDiscrepancy.count({
          where: { obligationId: row.obligationId, status: 'OPEN', id: { not: id } },
        });
        if (remaining === 0) {
          await tx.paymentObligation.update({
            where: { id: row.obligationId },
            data: { reconciliationStatus: 'MATCHED' },
          });
        }
      }
      await emitPaymentOutboxEvent(tx, {
        actorId: actor.id,
        eventType: 'payment.reconciliation.discrepancy_resolved',
        targetType: 'ReconciliationDiscrepancy',
        targetId: id,
        correlationId: actor.requestId ?? randomUUID(),
        reason: input.note,
        after: { status: input.resolution },
      });
      return updated;
    });
  }
}
