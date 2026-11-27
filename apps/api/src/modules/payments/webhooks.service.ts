import { randomUUID } from 'node:crypto';
import type { Prisma, WebhookInboxEvent } from '@prisma/client';
import { Injectable, Inject } from '@nestjs/common';
import { fail } from '../../common/errors.js';
import { logger } from '../../common/logging.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { PaymentProviderRegistry } from './provider.factory.js';
import type { PaymentProvider } from './provider.types.js';
import { applyEscrowSnapshot, emitPaymentOutboxEvent } from './state-transitions.js';

export const WEBHOOK_MAX_ATTEMPTS = 5;

function sanitizeWebhookPayload(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload ?? {})) as Prisma.InputJsonValue;
}

export async function processSingleWebhookEvent(
  tx: Db,
  provider: PaymentProvider,
  event: WebhookInboxEvent,
) {
  const normalized = provider.normalizeWebhookEvent(
    event.webhookId,
    event.eventType,
    event.eventTimestamp,
    event.payload,
  );
  const correlationId = `webhook:${event.webhookId}`;

  if (normalized.kind === 'ESCROW_STATUS') {
    const escrow = await tx.providerEscrow.findFirst({
      where: {
        provider: event.provider,
        environment: event.environment,
        externalEscrowId: normalized.escrow.externalEscrowId,
      },
      include: { obligation: true },
    });
    if (!escrow) {
      throw new Error(`ESCROW_NOT_FOUND:${normalized.escrow.externalEscrowId}`);
    }
    await applyEscrowSnapshot(tx, {
      escrowId: escrow.id,
      snapshot: normalized.escrow,
      provenance: provider.provenance,
      actorId: escrow.obligation.createdById,
      correlationId,
      source: `webhook:${event.eventType}`,
    });
    return;
  }

  if (normalized.kind === 'CONTRACT_SIGNED') {
    const escrow = await tx.providerEscrow.findFirst({
      where: {
        provider: event.provider,
        environment: event.environment,
        externalEscrowId: normalized.externalEscrowId,
      },
      include: { obligation: true },
    });
    if (!escrow) throw new Error(`ESCROW_NOT_FOUND:${normalized.externalEscrowId}`);
    await tx.providerEscrow.update({
      where: { id: escrow.id },
      data: {
        contractId: normalized.contractId,
        sellerSigned: normalized.signedBy === 'seller' ? true : escrow.sellerSigned,
        buyerSigned: normalized.signedBy === 'buyer' ? true : escrow.buyerSigned,
        isFullySigned: normalized.isFullySigned,
        lastSyncedAt: new Date(),
      },
    });
    await emitPaymentOutboxEvent(tx, {
      actorId: escrow.obligation.createdById,
      organizationId: escrow.obligation.buyerOrganizationId,
      eventType: 'payment.contract.signed',
      targetType: 'ProviderEscrow',
      targetId: escrow.id,
      correlationId,
      after: { signedBy: normalized.signedBy, isFullySigned: normalized.isFullySigned },
    });
    return;
  }

  if (normalized.kind === 'KYC_UPDATED' || normalized.kind === 'KYC_LINKED') {
    const kyc = await tx.artisanIdentityVerification.findUnique({
      where: {
        provider_environment_externalVerificationId: {
          provider: event.provider,
          environment: event.environment,
          externalVerificationId: normalized.verification.externalVerificationId,
        },
      },
    });
    if (!kyc) {
      throw new Error(`KYC_NOT_FOUND:${normalized.verification.externalVerificationId}`);
    }
    await tx.artisanIdentityVerification.update({
      where: { id: kyc.id },
      data: {
        kycStatus: normalized.verification.kycStatus,
        claimStatus: normalized.verification.claimStatus,
        needsAdminReview: normalized.verification.needsAdminReview,
        linkedUserId: normalized.verification.linkedUserId ?? kyc.linkedUserId,
      },
    });
    await emitPaymentOutboxEvent(tx, {
      actorId: kyc.consentActorId,
      eventType: `artisan.kyc.${normalized.verification.kycStatus.toLowerCase()}`,
      targetType: 'ArtisanIdentityVerification',
      targetId: kyc.id,
      correlationId,
      after: {
        kycStatus: normalized.verification.kycStatus,
        claimStatus: normalized.verification.claimStatus,
      },
    });
    return;
  }

  if (normalized.kind === 'DISPUTE_EVENT' && normalized.dispute.escrowId) {
    const escrow = await tx.providerEscrow.findFirst({
      where: {
        provider: event.provider,
        environment: event.environment,
        externalEscrowId: normalized.dispute.escrowId,
      },
      include: { obligation: true },
    });
    if (!escrow) throw new Error(`ESCROW_NOT_FOUND:${normalized.dispute.escrowId}`);
    const existing = await tx.providerDispute.findFirst({
      where: {
        escrowId: escrow.id,
        externalDisputeId: normalized.dispute.externalDisputeId,
      },
    });
    if (existing) {
      await tx.providerDispute.update({
        where: { id: existing.id },
        data: {
          status: normalized.dispute.status,
          outcome: normalized.dispute.outcome,
          closedAt: normalized.dispute.closedAt ? new Date(normalized.dispute.closedAt) : null,
        },
      });
    } else {
      await tx.providerDispute.create({
        data: {
          obligationId: escrow.obligationId,
          escrowId: escrow.id,
          provider: event.provider,
          environment: event.environment,
          externalDisputeId: normalized.dispute.externalDisputeId,
          ticketNumber: normalized.dispute.ticketNumber,
          kind: normalized.dispute.kind,
          status: normalized.dispute.status,
          outcome: normalized.dispute.outcome,
          reason: normalized.dispute.reason || 'Provider dispute',
          openedAt: new Date(normalized.dispute.openedAt),
          closedAt: normalized.dispute.closedAt ? new Date(normalized.dispute.closedAt) : null,
        },
      });
    }
    if (
      normalized.dispute.status !== 'CLOSED' &&
      !['SETTLED', 'CANCELLED', 'REFUNDED', 'FAILED'].includes(escrow.obligation.status)
    ) {
      await tx.paymentObligation.update({
        where: { id: escrow.obligationId },
        data: { status: 'DISPUTED' },
      });
    }
    await emitPaymentOutboxEvent(tx, {
      actorId: escrow.obligation.createdById,
      organizationId: escrow.obligation.buyerOrganizationId,
      eventType: `payment.dispute.${normalized.dispute.status.toLowerCase()}`,
      targetType: 'ProviderEscrow',
      targetId: escrow.id,
      correlationId,
      after: { disputeStatus: normalized.dispute.status },
    });
  }
}

export async function processWebhookInboxBatch(
  db: PrismaService,
  provider: PaymentProvider,
  limit = 25,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Webhook batch limit must be 1..100.');
  }
  let processed = 0;
  for (; processed < limit; processed++) {
    const result = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
        const [event] = await tx.$queryRaw<WebhookInboxEvent[]>`
          SELECT * FROM "WebhookInboxEvent"
          WHERE (
            ("status" IN ('RECEIVED', 'RETRY') AND "nextAttemptAt" <= CURRENT_TIMESTAMP)
            OR ("status" = 'PROCESSING' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < CURRENT_TIMESTAMP)
          )
          ORDER BY "createdAt" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `;
        if (!event) return null;

        await tx.$executeRawUnsafe('SAVEPOINT webhook_process');
        let errorMsg: string | null = null;
        try {
          await processSingleWebhookEvent(tx, provider, event);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT webhook_process');
        } catch (error) {
          errorMsg = error instanceof Error ? error.message : 'Webhook processing error';
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT webhook_process');
        }

        const attempts = event.attempts + 1;
        const status = errorMsg
          ? attempts >= WEBHOOK_MAX_ATTEMPTS
            ? 'QUARANTINED'
            : 'RETRY'
          : 'PROCESSED';

        await tx.webhookInboxEvent.update({
          where: { id: event.id },
          data: {
            attempts,
            status,
            leaseExpiresAt: null,
            nextAttemptAt: errorMsg
              ? new Date(Date.now() + Math.min(3600, 2 ** attempts) * 1000)
              : event.nextAttemptAt,
            processedAt: errorMsg ? null : new Date(),
            lastErrorCode: errorMsg ? 'WEBHOOK_PROCESSING_FAILED' : null,
            lastErrorMessage: errorMsg ? errorMsg.slice(0, 500) : null,
          },
        });
        return { id: event.id, webhookId: event.webhookId, status, attempts };
      },
      { timeout: 15000 },
    );
    if (!result) break;
    logger[result.status === 'PROCESSED' ? 'info' : 'warn'](result, 'Webhook inbox processed');
  }
  return processed;
}

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PaymentProviderRegistry) private readonly registry: PaymentProviderRegistry,
  ) {}

  async ingest(input: {
    rawBody: string;
    parsedBody: unknown;
    signature: string | undefined;
    timestamp: string | undefined;
    webhookId: string | undefined;
    eventHeader: string | undefined;
  }) {
    const provider = this.registry.getProvider();
    if (
      !provider.verifyWebhook({
        rawBody: input.rawBody,
        parsedBody: input.parsedBody,
        signature: input.signature,
        timestamp: input.timestamp,
        webhookId: input.webhookId,
        eventHeader: input.eventHeader,
      })
    ) {
      fail(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature or timestamp verification failed.');
    }

    const bodyObj = (
      input.parsedBody && typeof input.parsedBody === 'object' ? input.parsedBody : {}
    ) as { id?: unknown; type?: unknown; timestamp?: unknown };
    const webhookId =
      input.webhookId ?? (typeof bodyObj.id === 'string' ? bodyObj.id : randomUUID());
    const eventType =
      input.eventHeader ?? (typeof bodyObj.type === 'string' ? bodyObj.type : 'unknown');
    const eventTimestamp = new Date(
      input.timestamp ?? (typeof bodyObj.timestamp === 'string' ? bodyObj.timestamp : Date.now()),
    );
    if (Number.isNaN(eventTimestamp.getTime())) {
      fail(400, 'INVALID_WEBHOOK_TIMESTAMP', 'Invalid webhook timestamp.');
    }

    try {
      const created = await this.db.webhookInboxEvent.create({
        data: {
          provider: provider.name,
          environment: provider.environment,
          webhookId,
          eventType,
          eventTimestamp,
          signatureVerified: true,
          payload: sanitizeWebhookPayload(input.parsedBody),
          status: 'RECEIVED',
        },
        select: { id: true, webhookId: true, status: true },
      });
      return { accepted: true, duplicate: false, inboxId: created.id };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return { accepted: true, duplicate: true, webhookId };
      }
      throw error;
    }
  }

  async processPending(limit = 25) {
    return processWebhookInboxBatch(this.db, this.registry.getProvider(), limit);
  }

  async listInbox(actor: Actor, status?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.requireInternalFinance(tx, actor);
      return tx.webhookInboxEvent.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          provider: true,
          environment: true,
          webhookId: true,
          eventType: true,
          eventTimestamp: true,
          signatureVerified: true,
          status: true,
          attempts: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          processedAt: true,
          createdAt: true,
        },
      });
    });
  }

  async replayQuarantined(actor: Actor, inboxId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.requireInternalFinance(tx, actor);
      const row = await tx.webhookInboxEvent.findUnique({ where: { id: inboxId } });
      if (!row) fail(404, 'NOT_FOUND', 'Webhook event not found.');
      if (!['QUARANTINED', 'RETRY'].includes(row.status)) {
        fail(409, 'INVALID_TRANSITION', 'Only quarantined or retrying events can be replayed.');
      }
      return tx.webhookInboxEvent.update({
        where: { id: inboxId },
        data: {
          status: 'RETRY',
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    });
  }

  private async requireInternalFinance(tx: Db, actor: Actor) {
    const member = await tx.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member) fail(404, 'NOT_FOUND', 'Internal finance access required.');
  }
}
