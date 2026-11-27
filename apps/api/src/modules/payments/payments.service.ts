import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as C from '@nasj/contracts';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { fail } from '../../common/errors.js';
import type { Actor } from '../../common/identity.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { getTrialBalance, postJournalBatch } from './ledger.service.js';
import { PaymentProviderRegistry } from './provider.factory.js';
import { ProviderError } from './provider.types.js';
import { applyEscrowSnapshot, emitPaymentOutboxEvent } from './state-transitions.js';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function serializeObligationForBuyer(row: {
  id: string;
  channel: string;
  commercialOrderId: string | null;
  marketOrderId: string | null;
  currency: string;
  amountMillimes: bigint;
  feeBearer: string;
  expectedFeeMillimes: bigint;
  buyerFundingMillimes: bigint;
  status: string;
  reconciliationStatus: string;
  createdAt: Date;
  escrow: {
    id: string;
    provider: string;
    environment: string;
    externalEscrowId: string | null;
    mode: string;
    status: string;
    providerStatus: string;
    reviewHours: number;
    deliveredAt: Date | null;
    completionDeadline: Date | null;
    sellerSigned: boolean;
    buyerSigned: boolean;
    isFullySigned: boolean;
    contractPdfUrl: string | null;
    provenance: string;
    sessions?: {
      id: string;
      action: string;
      status: string;
      checkoutUrl: string | null;
      expiresAt: Date | null;
      createdAt: Date;
    }[];
  } | null;
}) {
  // Never expose internal artisan allocations or NASJ costs to buyers.
  return {
    id: row.id,
    channel: row.channel,
    commercialOrderId: row.commercialOrderId,
    marketOrderId: row.marketOrderId,
    currency: row.currency,
    amountTnd: C.formatTnd(row.amountMillimes),
    feeBearer: row.feeBearer,
    expectedFeeTnd: C.formatTnd(row.expectedFeeMillimes),
    buyerFundingTnd: C.formatTnd(row.buyerFundingMillimes),
    status: row.status,
    reconciliationStatus: row.reconciliationStatus,
    sandboxOnly: true,
    createdAt: row.createdAt,
    escrow: row.escrow
      ? {
          id: row.escrow.id,
          provider: row.escrow.provider,
          environment: row.escrow.environment,
          externalEscrowId: row.escrow.externalEscrowId,
          mode: row.escrow.mode,
          status: row.escrow.status,
          providerStatus: row.escrow.providerStatus,
          reviewHours: row.escrow.reviewHours,
          deliveredAt: row.escrow.deliveredAt,
          completionDeadline: row.escrow.completionDeadline,
          sellerSigned: row.escrow.sellerSigned,
          buyerSigned: row.escrow.buyerSigned,
          isFullySigned: row.escrow.isFullySigned,
          contractPdfUrl: row.escrow.contractPdfUrl,
          provenance: row.escrow.provenance,
          sessions: row.escrow.sessions ?? [],
        }
      : null,
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PaymentProviderRegistry) private readonly registry: PaymentProviderRegistry,
  ) {}

  private assertPaymentsActive() {
    if (this.config.NODE_ENV === 'production' || !this.registry.isEnabled()) {
      fail(
        503,
        'PAYMENTS_DISABLED',
        'Payment execution is disabled in this environment configuration.',
      );
    }
    if (this.config.REAL_PAYOUTS_ENABLED) {
      fail(503, 'REAL_PAYOUTS_FORBIDDEN', 'Real payouts remain disabled.');
    }
  }

  private async internalMembership(tx: Db, actor: Actor, permission?: C.Permission) {
    const member = await tx.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member) return null;
    const permissions = C.permissionsForMembership(member);
    if (permission && !permissions.includes(permission)) return null;
    return { member, permissions };
  }

  private async buyerMembership(tx: Db, actor: Actor, buyerOrganizationId: string) {
    return tx.organizationMember.findFirst({
      where: {
        userId: actor.id,
        organizationId: buyerOrganizationId,
        status: 'ACTIVE',
        organization: { approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
  }

  async providerStatus(actor: Actor) {
    await iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payout.read');
      if (!internal) fail(404, 'NOT_FOUND', 'Internal finance access required.');
    });
    const provider = this.registry.getProvider();
    if (!this.registry.isEnabled()) {
      return {
        enabled: false,
        provider: provider.name,
        environment: provider.environment,
        provenance: provider.provenance,
        realPayoutsEnabled: false,
        associatedAccountVerified: false,
      };
    }
    try {
      const verification = await provider.verifyAccountAssociation();
      return {
        enabled: true,
        provider: provider.name,
        provenance: provider.provenance,
        realPayoutsEnabled: false,
        ...verification,
      };
    } catch (error) {
      return {
        enabled: true,
        provider: provider.name,
        environment: provider.environment,
        provenance: provider.provenance,
        realPayoutsEnabled: false,
        authenticated: false,
        associatedAccountVerified: false,
        errorCode: error instanceof ProviderError ? error.code : 'PROVIDER_CHECK_FAILED',
      };
    }
  }

  /** Approves a B2C MarketOrder allocation plan (exact millimes, multi-artisan capable). */
  async approveB2cAllocationPlan(
    actor: Actor,
    marketOrderId: string,
    input: z.infer<typeof C.b2cAllocationPlanSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      if (!internal) fail(404, 'NOT_FOUND', 'Finance authorization required.');
      validateIdempotencyKey(key);
      return replaySafe(
        tx,
        { actorId: actor.id, resourceId: marketOrderId, operation: 'b2c.plan.approve', key },
        json(input),
        async () => {
          const order = await tx.marketOrder.findUnique({ where: { id: marketOrderId } });
          if (!order || order.totalMillimes === null || order.totalMillimes <= 0n) {
            fail(409, 'PRICED_ORDER_REQUIRED', 'B2C order must have an approved TND price.');
          }
          const activeObligation = await tx.paymentObligation.findFirst({
            where: {
              marketOrderId,
              status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED'] },
            },
          });
          if (activeObligation) {
            fail(409, 'FINANCIAL_PLAN_LOCKED', 'Cannot change allocation after checkout lock.');
          }
          const artisanCount = await tx.artisanProfile.count({
            where: { id: { in: input.artisans.map((a) => a.artisanId) } },
          });
          if (artisanCount !== input.artisans.length) {
            fail(400, 'INVALID_ARTISANS', 'All artisan profiles must exist and be unique.');
          }
          let allocation: ReturnType<typeof C.calculateFinancialAllocation>;
          try {
            allocation = C.calculateFinancialAllocation({
              policyVersion: 1,
              basis: input.basis,
              customerPriceMillimes: order.totalMillimes,
              materialCostMillimes: C.parseTnd(input.materialCostTnd),
              otherDirectCostMillimes: C.parseTnd(input.otherDirectCostTnd),
              expectedFeeMillimes: C.parseTnd(input.expectedFeeTnd),
              artisans: input.artisans,
            });
          } catch {
            return fail(
              400,
              'INVALID_FINANCIAL_PLAN',
              'Allocation percentages or costs exceed customer price.',
            );
          }

          const event = await tx.financeRecordEvent.create({
            data: {
              targetId: marketOrderId,
              targetType: 'B2cFinancialPlan',
              actorId: actor.id,
              status: 'APPROVED',
              reason: input.reason,
              data: json({
                marketOrderId,
                customerPriceMillimes: order.totalMillimes,
                allocation,
              }),
            },
          });
          await audit(tx, actor, {
            action: 'finance.b2c-plan.approve',
            targetType: 'MarketOrder',
            targetId: marketOrderId,
            reason: input.reason,
            after: {
              planId: event.id,
              totalCompensation: allocation.totalCompensationMillimes.toString(),
            },
          });
          return json({ id: event.id, status: 'APPROVED', allocation });
        },
      );
    });
  }

  /** Creates at most one active PaymentObligation and DHMAD/Mock Escrow for a B2C or B2B order. */
  async createObligationAndEscrow(
    actor: Actor,
    input: z.infer<typeof C.createPaymentObligationSchema>,
    key?: string,
  ) {
    this.assertPaymentsActive();
    validateIdempotencyKey(key);
    const provider = this.registry.getProvider();

    // Step 1: Short DB transaction — authorize, validate approved plan, create pending obligation/escrow.
    const prepared = await iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      let buyerOrganizationId: string;
      let amountMillimes: bigint;
      let expectedFeeMillimes = 0n;
      let financialPlanSnapshotId: string | null = null;
      let allocationSnapshot: Record<string, unknown>;
      let defaultTitle: string;
      let contractTerms: string | undefined;

      if (input.channel === 'B2B') {
        const order = await tx.commercialOrder.findUnique({
          where: { id: input.orderId },
          include: {
            rfq: true,
            acceptance: { include: { quote: true } },
          },
        });
        if (!order?.acceptance) {
          fail(409, 'ACCEPTANCE_REQUIRED', 'Accepted B2B quotation is required before funding.');
        }
        buyerOrganizationId = order.rfq.buyerOrganizationId;
        const buyer = await this.buyerMembership(tx, actor, buyerOrganizationId);
        if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Order not found.');

        const snapshot = await tx.financialPlanSnapshot.findFirst({
          where: { acceptanceId: order.acceptance.id },
          orderBy: { revision: 'desc' },
        });
        if (!snapshot) {
          fail(
            409,
            'FINANCIAL_PLAN_REQUIRED',
            'Approved NASJ financial plan is required before customer checkout.',
          );
        }
        financialPlanSnapshotId = snapshot.id;
        amountMillimes = snapshot.customerPriceMillimes;
        expectedFeeMillimes = snapshot.processingFeeMillimes;
        allocationSnapshot = {
          policyVersion: snapshot.policyVersion,
          calculationBase: snapshot.calculationBase,
          baseMillimes: snapshot.baseMillimes.toString(),
          materialCostMillimes: snapshot.materialCostMillimes.toString(),
          otherDirectCostMillimes: snapshot.otherDirectCostMillimes.toString(),
          processingFeeMillimes: snapshot.processingFeeMillimes.toString(),
          contributionMillimes: snapshot.contributionMillimes.toString(),
          allocations: snapshot.allocations,
        };
        defaultTitle = order.rfq.title;
        contractTerms =
          input.contractTerms ??
          `NASJ B2B Order ${order.id}: ${order.rfq.title} (${C.formatTnd(amountMillimes)} TND)`;
      } else {
        const order = await tx.marketOrder.findUnique({
          where: { id: input.orderId },
          include: { women: true },
        });
        if (!order || order.totalMillimes === null || order.totalMillimes <= 0n) {
          fail(409, 'PRICED_ORDER_REQUIRED', 'Priced B2C order is required before checkout.');
        }
        buyerOrganizationId = order.buyerOrgId;
        const buyer = await this.buyerMembership(tx, actor, buyerOrganizationId);
        if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Order not found.');

        const b2cPlan = await tx.financeRecordEvent.findFirst({
          where: { targetId: order.id, targetType: 'B2cFinancialPlan', status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
        });
        if (!b2cPlan) {
          fail(
            409,
            'FINANCIAL_PLAN_REQUIRED',
            'Approved NASJ financial allocation is required before customer checkout.',
          );
        }
        const planData = b2cPlan.data as {
          customerPriceMillimes?: string;
          allocation?: Record<string, unknown>;
        };
        if (planData.customerPriceMillimes !== order.totalMillimes.toString()) {
          fail(
            409,
            'FINANCIAL_PLAN_STALE',
            'B2C financial plan no longer matches the current order total.',
          );
        }
        amountMillimes = order.totalMillimes;
        allocationSnapshot = planData.allocation ?? {};
        defaultTitle = order.title;
      }

      // Idempotent return if an active obligation already exists for this order.
      const existing = await tx.paymentObligation.findFirst({
        where: {
          ...(input.channel === 'B2B'
            ? { commercialOrderId: input.orderId }
            : { marketOrderId: input.orderId }),
          status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED'] },
        },
        include: { escrow: { include: { sessions: true } } },
      });
      if (existing) {
        return { alreadyExists: true as const, obligation: existing };
      }

      const buyerFundingMillimes =
        input.feeBearer === 'BUYER' ? amountMillimes + expectedFeeMillimes : amountMillimes;
      const obligationId = randomUUID().replace(/-/g, '').slice(0, 24);
      const externalReference = `nasj_${obligationId}`;
      const reviewHours =
        input.channel === 'B2C'
          ? this.config.PAYMENT_B2C_REVIEW_HOURS
          : this.config.PAYMENT_B2B_REVIEW_HOURS;

      let obligation: Awaited<ReturnType<typeof tx.paymentObligation.create>>;
      try {
        obligation = await tx.paymentObligation.create({
          data: {
            id: obligationId,
            channel: input.channel,
            commercialOrderId: input.channel === 'B2B' ? input.orderId : null,
            marketOrderId: input.channel === 'B2C' ? input.orderId : null,
            buyerOrganizationId,
            financialPlanSnapshotId,
            allocationSnapshot: json(allocationSnapshot),
            currency: 'TND',
            amountMillimes,
            feeBearer: input.feeBearer,
            expectedFeeMillimes,
            buyerFundingMillimes,
            status: 'AWAITING_PAYMENT',
            createdById: actor.id,
          },
        });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          const raced = await tx.paymentObligation.findFirst({
            where: {
              ...(input.channel === 'B2B'
                ? { commercialOrderId: input.orderId }
                : { marketOrderId: input.orderId }),
              status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED'] },
            },
            include: { escrow: { include: { sessions: true } } },
          });
          if (raced) {
            return { alreadyExists: true as const, obligation: raced };
          }
        }
        throw error;
      }

      const escrow = await tx.providerEscrow.create({
        data: {
          obligationId: obligation.id,
          provider: provider.name,
          environment: provider.environment,
          externalReference,
          mode: input.channel === 'B2B' ? 'standard' : 'quick',
          recipientRole: 'NASJ_ASSOCIATED_ACCOUNT',
          buyerEmail: input.buyerEmail.toLowerCase(),
          sellerEmail: null,
          status: 'AWAITING_PAYMENT',
          providerStatus: 'pending',
          amountMillimes,
          buyerFundingMillimes,
          providerFeeMillimes: expectedFeeMillimes,
          reviewHours,
          contractTermsSha256: contractTerms ? sha256(contractTerms) : null,
          provenance: provider.provenance,
        },
      });

      const opKey = key ?? `create_escrow_${obligation.id}`;
      const operation = await tx.providerOperation.create({
        data: {
          obligationId: obligation.id,
          operationType: 'CREATE_ESCROW',
          idempotencyKey: opKey,
          status: 'PENDING',
          requestSummary: {
            externalReference,
            channel: input.channel,
            mode: escrow.mode,
            amountMillimes: amountMillimes.toString(),
          },
        },
      });

      await postJournalBatch(tx, {
        obligationId: obligation.id,
        sourceType: 'PaymentObligation',
        sourceId: obligation.id,
        idempotencyKey: `obligation:created:${obligation.id}`,
        description: `Customer payment obligation recognized (${input.channel})`,
        provenance: provider.provenance,
        lines: [
          {
            accountCode: 'CUSTOMER_RECEIVABLE',
            side: 'DEBIT',
            amountMillimes: buyerFundingMillimes,
          },
          {
            accountCode: 'NASJ_CONTRIBUTION_RESERVE',
            side: 'CREDIT',
            amountMillimes: buyerFundingMillimes,
          },
        ],
      });

      return {
        alreadyExists: false as const,
        obligation,
        escrow,
        operation,
        title: `${input.title ?? defaultTitle} [${externalReference}]`.slice(0, 200),
        contractTerms,
      };
    });

    if (prepared.alreadyExists) {
      return serializeObligationForBuyer(prepared.obligation);
    }

    // Step 2: External DHMAD/Mock provider call strictly OUTSIDE DB transaction.
    try {
      const remote = await provider.createEscrow({
        externalReference: prepared.escrow.externalReference,
        title: prepared.title,
        amountMillimes: prepared.obligation.amountMillimes,
        currency: 'TND',
        buyerEmail: prepared.escrow.buyerEmail,
        mode: prepared.escrow.mode as 'quick' | 'standard',
        feeBearer: prepared.obligation.feeBearer as C.FeeBearer,
        reviewHours: prepared.escrow.reviewHours,
        contractTerms: prepared.contractTerms,
        autoSignSeller: prepared.escrow.mode === 'standard',
      });

      // Step 3a: Persist provider identifiers & exact buyer funding amount.
      const saved = await this.db.$transaction(async (tx) => {
        await tx.providerOperation.update({
          where: { id: prepared.operation.id },
          data: {
            status: 'SUCCEEDED',
            responseSummary: {
              externalEscrowId: remote.externalEscrowId,
              rawStatus: remote.rawStatus,
              buyerFundingMillimes: remote.buyerFundingMillimes.toString(),
            },
          },
        });
        await tx.providerEscrow.update({
          where: { id: prepared.escrow.id },
          data: {
            externalEscrowId: remote.externalEscrowId,
            sellerEmail: remote.sellerEmail ?? null,
            providerStatus: remote.rawStatus,
            buyerFundingMillimes: remote.buyerFundingMillimes,
            providerFeeMillimes: remote.escrowFeeMillimes,
            contractId: remote.contractId ?? null,
            sellerSigned: remote.sellerSigned ?? false,
            buyerSigned: remote.buyerSigned ?? false,
            isFullySigned: remote.isFullySigned ?? false,
            contractPdfUrl: remote.contractPdfUrl ?? null,
            lastSyncedAt: new Date(),
          },
        });
        const expectedSeller = this.config.DHMAD_EXPECTED_SELLER_EMAIL;
        if (
          expectedSeller &&
          remote.sellerEmail &&
          remote.sellerEmail.toLowerCase() !== expectedSeller
        ) {
          await tx.paymentObligation.update({
            where: { id: prepared.obligation.id },
            data: { reconciliationStatus: 'DISCREPANCY_QUARANTINED' },
          });
          throw new ProviderError(
            'PERMISSION_OR_ASSOCIATION_DENIED',
            'RECIPIENT_MISMATCH',
            'Escrow seller email does not match configured NASJ recipient.',
          );
        }
        if (remote.buyerFundingMillimes !== prepared.obligation.buyerFundingMillimes) {
          const delta = remote.buyerFundingMillimes - prepared.obligation.buyerFundingMillimes;
          await tx.paymentObligation.update({
            where: { id: prepared.obligation.id },
            data: {
              expectedFeeMillimes: remote.escrowFeeMillimes,
              buyerFundingMillimes: remote.buyerFundingMillimes,
            },
          });
          await postJournalBatch(tx, {
            obligationId: prepared.obligation.id,
            sourceType: 'PaymentObligation',
            sourceId: prepared.obligation.id,
            idempotencyKey: `obligation:funding-adjusted:${prepared.obligation.id}`,
            description: 'Buyer funding obligation adjusted to provider fee quote',
            provenance: provider.provenance,
            lines:
              delta > 0n
                ? [
                    { accountCode: 'CUSTOMER_RECEIVABLE', side: 'DEBIT', amountMillimes: delta },
                    {
                      accountCode: 'NASJ_CONTRIBUTION_RESERVE',
                      side: 'CREDIT',
                      amountMillimes: delta,
                    },
                  ]
                : [
                    {
                      accountCode: 'NASJ_CONTRIBUTION_RESERVE',
                      side: 'DEBIT',
                      amountMillimes: -delta,
                    },
                    { accountCode: 'CUSTOMER_RECEIVABLE', side: 'CREDIT', amountMillimes: -delta },
                  ],
          });
        }
        await emitPaymentOutboxEvent(tx, {
          actorId: actor.id,
          organizationId: prepared.obligation.buyerOrganizationId,
          eventType: 'payment.escrow.created',
          targetType: 'ProviderEscrow',
          targetId: prepared.escrow.id,
          correlationId: actor.requestId ?? randomUUID(),
          after: { externalEscrowId: remote.externalEscrowId, mode: prepared.escrow.mode },
        });
        return tx.paymentObligation.findUniqueOrThrow({
          where: { id: prepared.obligation.id },
          include: { escrow: { include: { sessions: true } } },
        });
      });
      return serializeObligationForBuyer(saved);
    } catch (error) {
      const isAmbiguous =
        error instanceof ProviderError &&
        ['AMBIGUOUS_TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE'].includes(error.category);

      await this.db.$transaction(async (tx) => {
        await tx.providerOperation.update({
          where: { id: prepared.operation.id },
          data: {
            status: isAmbiguous ? 'AMBIGUOUS_QUARANTINED' : 'FAILED_DEFINITIVE',
            errorCode: error instanceof ProviderError ? error.code : 'PROVIDER_ERROR',
          },
        });
        if (isAmbiguous) {
          await tx.paymentObligation.update({
            where: { id: prepared.obligation.id },
            data: { reconciliationStatus: 'DISCREPANCY_QUARANTINED' },
          });
        } else {
          await tx.paymentObligation.update({
            where: { id: prepared.obligation.id },
            data: { status: 'FAILED' },
          });
          await tx.providerEscrow.update({
            where: { id: prepared.escrow.id },
            data: { status: 'FAILED', providerStatus: 'failed' },
          });
        }
      });
      throw error;
    }
  }

  /** Creates a hosted DHMAD/Mock checkout session with strict origin-locked redirectUrl. */
  async createCheckoutSession(
    actor: Actor,
    obligationId: string,
    input: z.infer<typeof C.createCheckoutSessionSchema>,
  ) {
    this.assertPaymentsActive();
    const provider = this.registry.getProvider();

    const loaded = await iamTransaction(this.db, actor, async (tx) => {
      const obligation = await tx.paymentObligation.findUnique({
        where: { id: obligationId },
        include: { escrow: true },
      });
      if (!obligation?.escrow) fail(404, 'NOT_FOUND', 'Payment obligation not found.');
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      const buyer = await this.buyerMembership(tx, actor, obligation.buyerOrganizationId);
      if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Payment obligation not found.');

      const sellerActions = [
        'cancel_escrow',
        'accept_cancellation',
        'reject_cancellation',
        'refund_funds',
      ];
      if (sellerActions.includes(input.action) && !internal) {
        fail(
          403,
          'FORBIDDEN',
          'Only authorized NASJ operators can initiate seller checkout actions.',
        );
      }
      if (!sellerActions.includes(input.action) && !buyer && !internal) {
        fail(403, 'FORBIDDEN', 'Buyer authorization is required.');
      }
      if (!obligation.escrow.externalEscrowId) {
        fail(
          409,
          'ESCROW_PENDING_RECONCILIATION',
          'Escrow creation is awaiting provider confirmation or reconciliation.',
        );
      }

      // Enforce delivery confirmation before completion.
      if (input.action === 'complete' && obligation.status === 'FUNDS_SECURED') {
        fail(409, 'DELIVERY_REQUIRED', 'Delivery must be confirmed before releasing escrow.');
      }

      const redirectUrl = new URL(input.redirectPath, this.config.PUBLIC_APP_URL).toString();
      if (new URL(redirectUrl).origin !== this.config.PUBLIC_APP_URL) {
        fail(400, 'INVALID_REDIRECT_URL', 'Redirect URL must remain within PUBLIC_APP_URL.');
      }

      const targetUserEmail =
        input.targetUserEmail?.toLowerCase() ??
        (sellerActions.includes(input.action)
          ? (obligation.escrow.sellerEmail ??
            this.config.DHMAD_EXPECTED_SELLER_EMAIL ??
            'nasj-seller@nasj.local')
          : obligation.escrow.buyerEmail);

      return { obligation, escrow: obligation.escrow, redirectUrl, targetUserEmail };
    });

    const remote = await provider.createCheckoutSession({
      externalEscrowId: loaded.escrow.externalEscrowId!,
      action: input.action,
      targetUserEmail: loaded.targetUserEmail,
      redirectUrl: loaded.redirectUrl,
      metadata: { obligation_id: loaded.obligation.id },
    });

    return this.db.checkoutSession.create({
      data: {
        escrowId: loaded.escrow.id,
        provider: provider.name,
        environment: provider.environment,
        action: input.action,
        targetUserEmail: loaded.targetUserEmail,
        externalSessionId: remote.externalSessionId,
        checkoutUrl: remote.url ?? null,
        redirectUrl: loaded.redirectUrl,
        status: 'PENDING',
        expiresAt: remote.expiresAt ? new Date(remote.expiresAt) : null,
        createdById: actor.id,
      },
    });
  }

  /** Syncs a checkout session and refreshes the underlying escrow from the provider (redirect alone never marks paid). */
  async syncCheckoutSession(actor: Actor, sessionId: string) {
    this.assertPaymentsActive();
    const provider = this.registry.getProvider();

    const row = await iamTransaction(this.db, actor, async (tx) => {
      const s = await tx.checkoutSession.findUnique({
        where: { id: sessionId },
        include: { escrow: { include: { obligation: true } } },
      });
      if (!s) fail(404, 'NOT_FOUND', 'Checkout session not found.');
      const internal = await this.internalMembership(tx, actor);
      const buyer = await this.buyerMembership(tx, actor, s.escrow.obligation.buyerOrganizationId);
      if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Checkout session not found.');
      return s;
    });

    if (!row.externalSessionId || !row.escrow.externalEscrowId) {
      return row;
    }
    const remoteSession = await provider.getCheckoutSession(row.externalSessionId);
    const remoteEscrow = await provider.getEscrow(row.escrow.externalEscrowId);

    return this.db.$transaction(async (tx) => {
      const updated = await tx.checkoutSession.update({
        where: { id: row.id },
        data: {
          status: remoteSession.status.toUpperCase(),
          completedAt: remoteSession.completedAt ? new Date(remoteSession.completedAt) : null,
        },
      });
      await applyEscrowSnapshot(tx, {
        escrowId: row.escrowId,
        snapshot: remoteEscrow,
        provenance: provider.provenance,
        actorId: actor.id,
        correlationId: actor.requestId ?? randomUUID(),
        source: 'session_sync',
      });
      return updated;
    });
  }

  /** Declares delivery on DHMAD ONLY after verified physical delivery evidence exists in NASJ. */
  async declareDelivery(
    actor: Actor,
    obligationId: string,
    input: z.infer<typeof C.deliverEscrowSchema>,
  ) {
    this.assertPaymentsActive();
    const provider = this.registry.getProvider();

    const loaded = await iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      if (!internal) fail(404, 'NOT_FOUND', 'Internal finance authorization required.');
      const obligation = await tx.paymentObligation.findUnique({
        where: { id: obligationId },
        include: { escrow: true },
      });
      if (!obligation?.escrow?.externalEscrowId) {
        fail(404, 'NOT_FOUND', 'Active provider escrow not found.');
      }
      if (obligation.status !== 'FUNDS_SECURED') {
        fail(409, 'FUNDS_NOT_SECURED', 'Escrow must be funded before declaring delivery.');
      }

      // Physical goods guard: shipment alone is NEVER enough.
      if (obligation.channel === 'B2B' && obligation.commercialOrderId) {
        const deliveryEvidence = await tx.deliveryReport.findFirst({
          where: { shipment: { orderId: obligation.commercialOrderId } },
        });
        if (!deliveryEvidence) {
          fail(
            409,
            'DELIVERY_EVIDENCE_REQUIRED',
            'Shipping alone cannot start delivery review; record physical delivery evidence first.',
          );
        }
      } else if (obligation.channel === 'B2C' && obligation.marketOrderId) {
        const order = await tx.marketOrder.findUniqueOrThrow({
          where: { id: obligation.marketOrderId },
        });
        if (order.status !== 'DELIVERED') {
          fail(
            409,
            'DELIVERY_EVIDENCE_REQUIRED',
            'B2C order must be confirmed delivered before starting provider release window.',
          );
        }
      }
      return obligation;
    });

    const remote = await provider.deliverEscrow(loaded.escrow!.externalEscrowId!);
    return this.db.$transaction(async (tx) => {
      await applyEscrowSnapshot(tx, {
        escrowId: loaded.escrow!.id,
        snapshot: remote,
        provenance: provider.provenance,
        actorId: actor.id,
        correlationId: actor.requestId ?? randomUUID(),
        source: 'deliver_escrow',
      });
      await audit(tx, actor, {
        action: 'payment.escrow.delivered',
        targetType: 'PaymentObligation',
        targetId: loaded.id,
        reason: input.reason,
      });
      const saved = await tx.paymentObligation.findUniqueOrThrow({
        where: { id: loaded.id },
        include: { escrow: true },
      });
      return serializeObligationForBuyer(saved);
    });
  }

  async cancelPendingEscrow(
    actor: Actor,
    obligationId: string,
    input: z.infer<typeof C.cancelEscrowSchema>,
  ) {
    this.assertPaymentsActive();
    const provider = this.registry.getProvider();

    const loaded = await iamTransaction(this.db, actor, async (tx) => {
      const obligation = await tx.paymentObligation.findUnique({
        where: { id: obligationId },
        include: { escrow: true },
      });
      if (!obligation?.escrow?.externalEscrowId) {
        fail(404, 'NOT_FOUND', 'Escrow not found.');
      }
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      const buyer = await this.buyerMembership(tx, actor, obligation.buyerOrganizationId);
      if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Escrow not found.');
      if (obligation.status !== 'AWAITING_PAYMENT') {
        fail(
          409,
          'ESCROW_ALREADY_FUNDED',
          'Paid escrows require a cancellation checkout session rather than direct API cancel.',
        );
      }
      return obligation;
    });

    const remote = await provider.cancelEscrow(loaded.escrow!.externalEscrowId!);
    return this.db.$transaction(async (tx) => {
      await applyEscrowSnapshot(tx, {
        escrowId: loaded.escrow!.id,
        snapshot: remote,
        provenance: provider.provenance,
        actorId: actor.id,
        correlationId: actor.requestId ?? randomUUID(),
        source: 'cancel_escrow',
      });
      await audit(tx, actor, {
        action: 'payment.escrow.cancelled',
        targetType: 'PaymentObligation',
        targetId: loaded.id,
        reason: input.reason,
      });
      const saved = await tx.paymentObligation.findUniqueOrThrow({
        where: { id: loaded.id },
        include: { escrow: true },
      });
      return serializeObligationForBuyer(saved);
    });
  }

  // Artisan pre-account KYC integration (never stores raw ID documents inside NASJ).
  async initiateArtisanKyc(
    actor: Actor,
    artisanProfileId: string,
    input: z.infer<typeof C.initiateKycSchema>,
  ) {
    this.assertPaymentsActive();
    const provider = this.registry.getProvider();

    const profile = await iamTransaction(this.db, actor, async (tx) => {
      const artisan = await tx.artisanProfile.findUnique({ where: { id: artisanProfileId } });
      if (!artisan) fail(404, 'NOT_FOUND', 'Artisan profile not found.');
      const internal = await this.internalMembership(tx, actor, 'finance.payable.reconcile');
      if (artisan.userId !== actor.id && !internal) {
        fail(404, 'NOT_FOUND', 'Artisan profile not found.');
      }
      return artisan;
    });

    const redirectUrl = input.redirectPath
      ? new URL(input.redirectPath, this.config.PUBLIC_APP_URL).toString()
      : undefined;

    const remote = await provider.createIdentityVerification({
      email: input.email,
      externalUserId: profile.id,
      redirectUrl,
    });

    return this.db.$transaction(async (tx) => {
      const row = await tx.artisanIdentityVerification.upsert({
        where: {
          provider_environment_externalVerificationId: {
            provider: provider.name,
            environment: provider.environment,
            externalVerificationId: remote.externalVerificationId,
          },
        },
        create: {
          artisanProfileId: profile.id,
          provider: provider.name,
          environment: provider.environment,
          externalVerificationId: remote.externalVerificationId,
          email: remote.email,
          consentRecordedAt: new Date(),
          consentActorId: actor.id,
          kycStatus: remote.kycStatus,
          claimStatus: remote.claimStatus,
          needsAdminReview: remote.needsAdminReview,
          linkedUserId: remote.linkedUserId,
          provenance: provider.provenance,
        },
        update: {
          kycStatus: remote.kycStatus,
          claimStatus: remote.claimStatus,
          needsAdminReview: remote.needsAdminReview,
          linkedUserId: remote.linkedUserId,
        },
      });
      await emitPaymentOutboxEvent(tx, {
        actorId: actor.id,
        eventType: 'artisan.kyc.initiated',
        targetType: 'ArtisanIdentityVerification',
        targetId: row.id,
        correlationId: actor.requestId ?? randomUUID(),
        after: { kycStatus: row.kycStatus, provenance: row.provenance },
      });
      return row;
    });
  }

  async reviewArtisanKyc(
    actor: Actor,
    verificationId: string,
    input: z.infer<typeof C.reviewKycSchema>,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payout.approve');
      if (!internal) fail(404, 'NOT_FOUND', 'Finance approval permission required.');
      const row = await tx.artisanIdentityVerification.findUnique({
        where: { id: verificationId },
      });
      if (!row) fail(404, 'NOT_FOUND', 'KYC verification record not found.');
      const saved = await tx.artisanIdentityVerification.update({
        where: { id: verificationId },
        data: {
          kycStatus: input.decision,
          needsAdminReview: false,
          adminReviewedById: actor.id,
          adminReviewNote: input.note,
          adminReviewedAt: new Date(),
        },
      });
      await audit(tx, actor, {
        action: 'artisan.kyc.reviewed',
        targetType: 'ArtisanIdentityVerification',
        targetId: verificationId,
        reason: input.note,
        after: { decision: input.decision },
      });
      return saved;
    });
  }

  async artisanKycStatus(actor: Actor, artisanProfileId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const artisan = await tx.artisanProfile.findUnique({ where: { id: artisanProfileId } });
      if (!artisan) fail(404, 'NOT_FOUND', 'Artisan profile not found.');
      const internal = await this.internalMembership(tx, actor, 'finance.payout.read');
      if (artisan.userId !== actor.id && !internal) {
        fail(404, 'NOT_FOUND', 'Artisan profile not found.');
      }
      const verifications = await tx.artisanIdentityVerification.findMany({
        where: { artisanProfileId },
        orderBy: { createdAt: 'desc' },
      });
      return {
        artisanProfileId,
        latest: verifications[0] ?? null,
        history: verifications,
      };
    });
  }

  /** Simulated payout execution (never initiates real transfers; posts balanced ledger batch). */
  async simulatePayout(actor: Actor, input: z.infer<typeof C.simulatePayoutSchema>, key?: string) {
    if (this.config.REAL_PAYOUTS_ENABLED || this.config.ARTISAN_PAYOUT_MODE !== 'simulation') {
      fail(503, 'REAL_PAYOUTS_FORBIDDEN', 'Only simulated artisan payouts are permitted.');
    }
    return iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payout.execute');
      if (!internal) fail(404, 'NOT_FOUND', 'Payout execution permission required.');
      validateIdempotencyKey(key);
      return replaySafe(
        tx,
        {
          actorId: actor.id,
          resourceId: input.payoutRequestId,
          operation: 'payout.simulate',
          key,
        },
        json(input),
        async () => {
          const payout = await tx.payoutRequest.findUnique({
            where: { id: input.payoutRequestId },
            include: { payable: true },
          });
          if (!payout) fail(404, 'NOT_FOUND', 'Payout request not found.');
          if (payout.status !== 'APPROVED' || !payout.approverId) {
            fail(
              409,
              'PAYOUT_NOT_APPROVED',
              'Payout request must be independently approved first.',
            );
          }
          if (payout.requesterId === payout.approverId) {
            fail(409, 'SELF_APPROVAL_DENIED', 'Requester and approver must be independent.');
          }
          const openDisputes = payout.payable.batchId
            ? await tx.paymentDispute.count({
                where: {
                  batchId: payout.payable.batchId,
                  status: { notIn: ['RESOLVED', 'CLOSED'] },
                },
              })
            : 0;
          if (openDisputes > 0) {
            fail(409, 'OPEN_PAYMENT_DISPUTE', 'Payout simulation blocked by open dispute.');
          }

          const existingSim = await tx.artisanPayoutSimulation.findFirst({
            where: {
              payoutRequestId: payout.id,
              status: { in: ['PAYOUT_SCHEDULED', 'PAYOUT_PROCESSING', 'PAID'] },
            },
          });
          if (existingSim) {
            fail(
              409,
              'DUPLICATE_PAYOUT_SIMULATION',
              'An active or completed simulated payout already exists.',
            );
          }

          const sim = await tx.artisanPayoutSimulation.create({
            data: {
              payoutRequestId: payout.id,
              artisanProfileId: payout.payable.artisanProfileId,
              amountMillimes: payout.amountMillimes,
              currency: 'TND',
              mode: 'SIMULATION',
              isSimulated: true,
              provenance: 'SIMULATED_SANDBOX_ONLY',
              reference: input.reference,
              status: input.outcome,
              reason: input.reason,
              executedById: actor.id,
            },
          });

          if (input.outcome === 'PAID') {
            await postJournalBatch(tx, {
              payoutSimulationId: sim.id,
              sourceType: 'ArtisanPayoutSimulation',
              sourceId: sim.id,
              idempotencyKey: `payout-sim:paid:${sim.id}`,
              description: `Simulated artisan payout (${sim.reference})`,
              provenance: 'MOCK_SIMULATION',
              lines: [
                {
                  accountCode: 'ARTISAN_PAYABLE_LIABILITY',
                  side: 'DEBIT',
                  amountMillimes: sim.amountMillimes,
                  artisanProfileId: sim.artisanProfileId,
                },
                {
                  accountCode: 'SIMULATED_CASH_OUT',
                  side: 'CREDIT',
                  amountMillimes: sim.amountMillimes,
                  artisanProfileId: sim.artisanProfileId,
                },
              ],
            });
          }

          await emitPaymentOutboxEvent(tx, {
            actorId: actor.id,
            eventType: `artisan.payout_simulation.${input.outcome.toLowerCase()}`,
            targetType: 'ArtisanPayoutSimulation',
            targetId: sim.id,
            correlationId: actor.requestId ?? randomUUID(),
            reason: input.reason,
            after: { isSimulated: true, mode: 'SIMULATION', status: sim.status },
          });

          return json({
            ...sim,
            amountMillimes: undefined,
            amountTnd: C.formatTnd(sim.amountMillimes),
          });
        },
      );
    });
  }

  /** Returns role/tenant-scoped obligation details (buyers never see artisan allocations). */
  async getObligation(actor: Actor, obligationId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.paymentObligation.findUnique({
        where: { id: obligationId },
        include: {
          escrow: {
            include: {
              sessions: {
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                  id: true,
                  action: true,
                  status: true,
                  checkoutUrl: true,
                  expiresAt: true,
                  createdAt: true,
                },
              },
            },
          },
          disputes: true,
        },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Payment obligation not found.');
      const internal = await this.internalMembership(tx, actor, 'finance.payout.read');
      const buyer = await this.buyerMembership(tx, actor, row.buyerOrganizationId);
      if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Payment obligation not found.');
      if (!internal) return serializeObligationForBuyer(row);

      const ledger = await getTrialBalance(tx, row.id);
      return {
        ...serializeObligationForBuyer(row),
        allocationSnapshot: row.allocationSnapshot,
        releasedToNasjTnd: C.formatTnd(row.releasedToNasjMillimes),
        actualFeeTnd: C.formatTnd(row.actualFeeMillimes),
        refundedTnd: C.formatTnd(row.refundedMillimes),
        disputes: row.disputes,
        ledger: {
          balanced: ledger.balanced,
          totalDebitsTnd: C.formatTnd(ledger.totalDebitsMillimes),
          totalCreditsTnd: C.formatTnd(ledger.totalCreditsMillimes),
          accounts: ledger.accounts.map((a) => ({
            accountCode: a.accountCode,
            debitTnd: C.formatTnd(a.debitMillimes),
            creditTnd: C.formatTnd(a.creditMillimes),
          })),
        },
      };
    });
  }

  async listObligationsForOrder(actor: Actor, channel: 'B2C' | 'B2B', orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const rows = await tx.paymentObligation.findMany({
        where: channel === 'B2B' ? { commercialOrderId: orderId } : { marketOrderId: orderId },
        include: {
          escrow: {
            include: {
              sessions: {
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                  id: true,
                  action: true,
                  status: true,
                  checkoutUrl: true,
                  expiresAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!rows.length) return [];
      const internal = await this.internalMembership(tx, actor, 'finance.payout.read');
      const buyer = await this.buyerMembership(tx, actor, rows[0].buyerOrganizationId);
      if (!internal && !buyer) fail(404, 'NOT_FOUND', 'Order obligations not found.');
      return rows.map((r) =>
        internal
          ? { ...serializeObligationForBuyer(r), allocationSnapshot: r.allocationSnapshot }
          : serializeObligationForBuyer(r),
      );
    });
  }

  /** Artisan-scoped view: only own allocation share, own KYC, own payables and simulated payouts. */
  async myArtisanFinance(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const artisan = await tx.artisanProfile.findUnique({
        where: { userId: actor.id },
      });
      if (!artisan) fail(404, 'NOT_FOUND', 'Artisan profile not found.');
      const [verifications, payables, simulations, obligations] = await Promise.all([
        tx.artisanIdentityVerification.findMany({
          where: { artisanProfileId: artisan.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        tx.artisanPayable.findMany({
          where: { artisanProfileId: artisan.id },
          orderBy: { createdAt: 'desc' },
        }),
        tx.artisanPayoutSimulation.findMany({
          where: { artisanProfileId: artisan.id },
          orderBy: { createdAt: 'desc' },
        }),
        tx.paymentObligation.findMany({
          where: {
            OR: [
              { commercialOrder: { offers: { some: { artisanProfileId: artisan.id } } } },
              { marketOrder: { women: { some: { artisanProfileId: artisan.id } } } },
            ],
          },
          select: {
            id: true,
            channel: true,
            commercialOrderId: true,
            marketOrderId: true,
            status: true,
            allocationSnapshot: true,
            createdAt: true,
          },
        }),
      ]);

      // Extract ONLY this artisan's allocation share; strip peer artisans and NASJ internal costs.
      const myAllocations = obligations.map((ob) => {
        const snap = ob.allocationSnapshot as {
          allocations?: {
            artisanProfileId?: string;
            artisanId?: string;
            basisPoints?: number;
            amountMillimes?: string;
          }[];
          artisans?: { artisanId?: string; basisPoints?: number; amountMillimes?: string }[];
        };
        const list = (snap.allocations ?? snap.artisans ?? []) as {
          artisanProfileId?: string;
          artisanId?: string;
          basisPoints?: number;
          amountMillimes?: string;
        }[];
        const mine = list.find(
          (entry) => entry.artisanProfileId === artisan.id || entry.artisanId === artisan.id,
        );
        return {
          obligationId: ob.id,
          channel: ob.channel,
          orderId: ob.commercialOrderId ?? ob.marketOrderId,
          obligationStatus: ob.status,
          myShareBasisPoints: mine?.basisPoints ?? null,
          myExpectedCompensationTnd: mine?.amountMillimes
            ? C.formatTnd(BigInt(mine.amountMillimes))
            : null,
          createdAt: ob.createdAt,
        };
      });

      return {
        artisanProfileId: artisan.id,
        kyc: verifications[0] ?? null,
        allocations: myAllocations,
        payables: payables.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          milestone: p.milestone,
          status: p.status,
          amountTnd: C.formatTnd(p.amountMillimes),
          provenance: p.provenance,
        })),
        payoutSimulations: simulations.map((s) => ({
          id: s.id,
          reference: s.reference,
          status: s.status,
          isSimulated: s.isSimulated,
          mode: s.mode,
          provenance: s.provenance,
          amountTnd: C.formatTnd(s.amountMillimes),
          executedAt: s.executedAt,
        })),
      };
    });
  }

  async replyToProviderDispute(actor: Actor, disputeId: string, body: string, key?: string) {
    this.assertPaymentsActive();
    validateIdempotencyKey(key);
    const provider = this.registry.getProvider();
    const dispute = await iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.dispute.manage');
      if (!internal) fail(404, 'NOT_FOUND', 'Dispute management permission required.');
      const row = await tx.providerDispute.findUnique({ where: { id: disputeId } });
      if (!row?.externalDisputeId) fail(404, 'NOT_FOUND', 'Provider dispute not found.');
      return row;
    });
    await provider.replyDispute(dispute.externalDisputeId!, body, key ?? randomUUID());
    await iamTransaction(this.db, actor, async (tx) => {
      await audit(tx, actor, {
        action: 'payment.dispute.replied',
        targetType: 'ProviderDispute',
        targetId: dispute.id,
      });
    });
    return { sent: true };
  }

  async ledgerTrialBalance(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const internal = await this.internalMembership(tx, actor, 'finance.payout.read');
      if (!internal) fail(404, 'NOT_FOUND', 'Finance read permission required.');
      const tb = await getTrialBalance(tx);
      return {
        balanced: tb.balanced,
        totalDebitsTnd: C.formatTnd(tb.totalDebitsMillimes),
        totalCreditsTnd: C.formatTnd(tb.totalCreditsMillimes),
        accounts: tb.accounts.map((a) => ({
          accountCode: a.accountCode,
          debitTnd: C.formatTnd(a.debitMillimes),
          creditTnd: C.formatTnd(a.creditMillimes),
        })),
      };
    });
  }
}
