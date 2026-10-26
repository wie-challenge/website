import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, CommercialOffer, SyntheticPayment } from '@prisma/client';
import {
  type CommerceMetrics,
  type BusinessRole,
  type CommerceRole,
  type CommerceWorkspaceView,
  type RfqCreate,
  type RfqEdit,
  type RfqAction,
  type OfferCreate,
  type OfferAction,
  type BatchAction,
  type ProgressInput,
  type InspectionInput,
  type OrderAction,
  type PaymentCreate,
  type PaymentAction,
  type RfqState,
  type OfferState,
  type BatchState,
  type OrderState,
  type PaymentState,
  parseTnd,
  formatTnd,
  requireRule,
  transitionRfq,
  transitionOffer,
  transitionBatch,
  transitionOrder,
  transitionPayment,
  validateProgress,
  reconcileInspection,
  reconcileFulfillment,
  reconcileSettlement,
  payableForUnits,
  rfqEdges,
  offerEdges,
  batchEdges,
  orderEdges,
  paymentEdges,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import {
  ResourcePolicyService,
  orderInclude,
  type OrderRecord,
} from '../foundation/resource-policy.service.js';
import { actionForbidden } from '../../common/errors.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { audit } from '../foundation/audit.js';
import { findCatalogExample, projectBuyerCatalog } from './catalog.js';
import { activity, revision } from '../procurement/records.js';

const operatorCapacities: CommerceRole[] = [
  'PRODUCTION_MANAGER',
  'FINANCE_MANAGER',
  'QUALITY_INSPECTOR',
  'INVENTORY_LOGISTICS_COORDINATOR',
];
const saved = (row: { id: string; version: number }) => ({ id: row.id, version: row.version });
const sums = <T>(rows: T[], value: (row: T) => bigint) =>
  rows.reduce((total, row) => total + value(row), 0n);
function version(actual: number, expected: number) {
  requireRule(
    actual === expected,
    'VERSION_CONFLICT',
    'This record changed. Reload the workspace before trying again.',
  );
}
// Capacities come from held permissions (see ResourcePolicyService), never from role names.
function permit(capacities: readonly CommerceRole[], allowed: readonly CommerceRole[]) {
  if (!allowed.some((capacity) => capacities.includes(capacity))) actionForbidden();
}
function roleForNext<S extends string>(
  roles: CommerceRole[],
  next: S,
  edges: readonly (readonly [S, S, readonly CommerceRole[]])[],
) {
  permit(
    roles,
    edges.filter((edge) => edge[1] === next).flatMap((edge) => [...edge[2]]),
  );
}
function held(offer: CommercialOffer, now = new Date()) {
  return (
    offer.status === 'ACCEPTED' ||
    (['PLANNED', 'OFFERED'].includes(offer.status) && offer.expiresAt > now)
  );
}
function livePayment(payment: SyntheticPayment) {
  return !['FAILED', 'CANCELLED'].includes(payment.status);
}
function orderQuantities(order: OrderRecord) {
  const add = (name: 'produced' | 'submitted' | 'approved' | 'rejected' | 'pending') =>
    order.batches.reduce((n, b) => n + b[name], 0);
  return {
    requested: order.rfq.quantity,
    reserved: order.offers
      .filter((o) => o.status !== 'ACCEPTED' && held(o))
      .reduce((n, o) => n + o.quantity, 0),
    allocated: order.offers
      .filter((o) => o.status === 'ACCEPTED')
      .reduce((n, o) => n + o.quantity, 0),
    produced: add('produced'),
    submitted: add('submitted'),
    approved: add('approved'),
    rejected: add('rejected'),
    pending: add('pending'),
    delivered: order.delivered,
  };
}
@Injectable()
export class CommerceService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ResourcePolicyService) private readonly policy: ResourcePolicyService,
  ) {}
  async catalog(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) =>
      projectBuyerCatalog(
        await tx.craftSkill.findMany({
          where: { isActive: true },
          select: { id: true, name: true, description: true },
          orderBy: { name: 'asc' },
          take: 100,
        }),
      ),
    );
  }
  private async requireArtisanConsent(tx: Db, actor: Actor) {
    requireRule(
      await tx.consentRecord.findFirst({
        where: {
          userId: actor.id,
          purpose: 'artisan.profile',
          decision: true,
          withdrawnAt: null,
        },
      }),
      'CONSENT_REQUIRED',
      'Active artisan profile processing consent is required.',
    );
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    key: string | undefined,
    resourceId: string,
    operation: string,
    input: Prisma.InputJsonValue,
    fn: () => Promise<T>,
  ) {
    requireRule(key, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required for this command.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId, operation: `commerce.${operation}`, key },
      input,
      fn,
    );
  }
  private async event(
    tx: Db,
    actor: Actor,
    rfq: OrderRecord['rfq'],
    action: string,
    targetType: string,
    targetId: string,
  ) {
    if (targetType === 'CommercialRfq' || targetType === 'CommercialOrder') {
      const current = await tx.commercialRfq.findUniqueOrThrow({ where: { id: rfq.id } });
      if (action === 'rfq.create' || action === 'rfq.edit')
        await revision(
          tx,
          actor,
          current,
          action === 'rfq.create' ? 'Initial buyer draft.' : 'Buyer edited the draft.',
        );
      await activity(tx, actor, current, action);
    }
    await audit(tx, actor, {
      action: `commerce.${action}`,
      targetType,
      targetId,
      organizationId: rfq.buyerOrganizationId,
      after: { provenance: 'SYNTHETIC' },
    });
  }
  async report(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row: order, scope, capacities } = await this.policy.order(actor, id, tx);
      permit(capacities, ['BUYER', ...operatorCapacities]);
      const projection = await tx.commerceProjection.findUnique({ where: { orderId: id } });
      const pending = await tx.outboxEvent.count({
        where: {
          organizationId: order.rfq.buyerOrganizationId,
          eventType: { startsWith: 'commerce.' },
          status: { not: 'DELIVERED' },
        },
      });
      if (!projection)
        return { orderId: id, status: 'PENDING', pendingEvents: pending, metrics: null };
      const metrics = projection.metrics as unknown as CommerceMetrics;
      // Buyer and quality/logistics projections never include individual artisan earnings.
      const finance = this.policy.has(
        scope,
        order.rfq.operatorOrganizationId,
        'finance.payment.manage',
      )
        ? metrics.finance
        : capacities.includes('BUYER')
          ? {
              currency: 'TND',
              unit: 'MILLIME',
              buyerReceived: metrics.finance.buyerReceived,
              verifiedSettlement: null,
              coverage: { verifiedSettlement: 'UNAVAILABLE' },
            }
          : null;
      return {
        orderId: id,
        status: pending ? 'STALE' : 'CURRENT',
        pendingEvents: pending,
        asOf: projection.asOf.toISOString(),
        definitionVersion: projection.definitionVersion,
        metrics: { ...metrics, finance },
      };
    });
  }
  async reportCsv(actor: Actor, id: string) {
    const report = await this.report(actor, id);
    const lines = ['metric,numerator,denominator,unit,provenance'];
    if (report.metrics) {
      for (const [name, value] of Object.entries(report.metrics.fulfillment))
        lines.push(`${name},${value.numerator},${value.denominator},PIECES,SYNTHETIC`);
      for (const [name, value] of Object.entries(report.metrics.finance ?? {}))
        if (typeof value === 'string' && /^\d+$/.test(value))
          lines.push(`${name},${value},,MILLIME,SYNTHETIC`);
    }
    // Every cell comes from the fixed registry or integers, never user-entered CSV formulas.
    return `${lines.join('\r\n')}\r\n`;
  }
  async inbox(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.policy.scope(actor, tx);
      const buyers = this.policy.buyerOrganizationIds(scope);
      // Operator inbox event codes can reveal financial activity: limit them to finance/production.
      const operators = [
        ...new Set([
          ...this.policy.operatorOrganizationIds(scope, 'FINANCE_MANAGER'),
          ...this.policy.operatorOrganizationIds(scope, 'PRODUCTION_MANAGER'),
        ]),
      ];
      return tx.commerceNotice.findMany({
        where: {
          OR: [
            { audience: 'BUYER', scopeId: { in: buyers } },
            { audience: 'OPERATOR', scopeId: { in: operators } },
            { audience: 'ARTISAN', scopeId: actor.id },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: { id: true, code: true, createdAt: true },
      });
    });
  }
  async createRfq(actor: Actor, input: RfqCreate, key?: string, managed = false) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.policy.scope(actor, tx);
      this.policy.requirePermission(
        this.policy.buyerOrganizationIds(scope).includes(input.buyerOrganizationId) &&
          this.policy.has(scope, input.buyerOrganizationId, 'buyer.rfq.create'),
      );
      requireRule(
        await tx.organization.findFirst({
          where: { id: input.operatorOrganizationId, type: 'INTERNAL', approvalStatus: 'APPROVED' },
        }),
        'INVALID_OPERATOR',
        'Choose an approved internal operator organization.',
      );
      requireRule(
        await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } }),
        'INVALID_CRAFT',
        'Choose an active craft.',
      );
      if (input.catalogExampleId !== undefined) {
        const example = findCatalogExample(input.catalogExampleId);
        requireRule(
          example?.availability === 'ILLUSTRATIVE' && example.craftSkillId === input.craftSkillId,
          'INVALID_CATALOG_SELECTION',
          'Choose an available example for this craft or start a request without a catalog example.',
        );
      }
      return this.command(
        tx,
        actor,
        key,
        input.buyerOrganizationId,
        'rfq.create',
        { ...input, managed },
        async () => {
          requireRule(
            new Date(input.deliveryAt) > new Date(),
            'INVALID_DEADLINE',
            'Choose a future delivery deadline.',
          );
          const { catalogExampleId: _example, ...fields } = input;
          const row = await tx.commercialRfq.create({
            data: {
              ...fields,
              deliveryAt: new Date(input.deliveryAt),
              procurementManaged: managed,
            },
          });
          await this.event(tx, actor, row, 'rfq.create', 'CommercialRfq', row.id);
          return saved(row);
        },
      );
    });
  }
  async editRfq(actor: Actor, id: string, input: RfqEdit, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, scope, capacities } = await this.policy.rfq(actor, id, tx);
      permit(capacities, ['BUYER']);
      this.policy.requirePermission(
        this.policy.has(scope, row.buyerOrganizationId, 'buyer.rfq.create'),
      );
      return this.command(tx, actor, key, id, 'rfq.edit', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'DRAFT',
          'INVALID_TRANSITION',
          'Submitted content is immutable; only drafts can be edited.',
        );
        requireRule(
          new Date(input.deliveryAt) > new Date(),
          'INVALID_DEADLINE',
          'Choose a future delivery deadline.',
        );
        requireRule(
          await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } }),
          'INVALID_CRAFT',
          'Choose an active craft.',
        );
        const { version: _version, ...data } = input;
        const result = await tx.commercialRfq.update({
          where: { id },
          data: { ...data, deliveryAt: new Date(data.deliveryAt), version: { increment: 1 } },
        });
        await this.event(tx, actor, row, 'rfq.edit', 'CommercialRfq', id);
        return saved(result);
      });
    });
  }
  async rfqAction(actor: Actor, id: string, input: RfqAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, scope, capacities: roles } = await this.policy.rfq(actor, id, tx);
      if (row.procurementManaged && ['QUOTED', 'ACCEPTED'].includes(input.next))
        requireRule(
          false,
          'INVALID_TRANSITION',
          'Use the versioned procurement quotation and acceptance workflow.',
        );
      roleForNext(roles, input.next, rfqEdges);
      if (input.next === 'SUBMITTED')
        this.policy.requirePermission(
          this.policy.has(scope, row.buyerOrganizationId, 'buyer.rfq.create'),
        );
      if (input.next === 'ACCEPTED')
        this.policy.requirePermission(
          this.policy.has(scope, row.buyerOrganizationId, 'buyer.quotation.approve'),
        );
      return this.command(tx, actor, key, id, 'rfq.action', input, async () => {
        version(row.version, input.version);
        transitionRfq(row.status as RfqState, input.next, roles, {
          quoteValid:
            row.quoteMillimes !== null &&
            Boolean(row.quoteExpiresAt && row.quoteExpiresAt > new Date()),
          quoteExpired: Boolean(row.quoteExpiresAt && row.quoteExpiresAt <= new Date()),
        });
        if (input.next === 'SUBMITTED')
          requireRule(
            row.deliveryAt > new Date(),
            'INVALID_DEADLINE',
            'Delivery deadline has passed. Edit the draft before submitting.',
          );
        const quote =
          input.next === 'QUOTED'
            ? {
                quoteMillimes: parseTnd(input.quoteTnd),
                quoteExpiresAt: new Date(input.quoteExpiresAt),
              }
            : {};
        if (input.next === 'QUOTED')
          requireRule(
            quote.quoteMillimes! > 0n &&
              quote.quoteExpiresAt! > new Date() &&
              quote.quoteExpiresAt! < row.deliveryAt,
            'INVALID_QUOTE',
            'Use a positive price and future expiry before delivery.',
          );
        const result = await tx.commercialRfq.update({
          where: { id },
          data: { status: input.next, version: { increment: 1 }, ...quote },
        });
        if (input.next === 'ACCEPTED') await tx.commercialOrder.create({ data: { rfqId: id } });
        await this.event(tx, actor, row, `rfq.${input.next.toLowerCase()}`, 'CommercialRfq', id);
        return saved(result);
      });
    });
  }
  async createOffer(actor: Actor, input: OfferCreate, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row: order, capacities } = await this.policy.order(actor, input.orderId, tx);
      permit(capacities, ['PRODUCTION_MANAGER']);
      const capacity = await tx.capacityDeclaration.findUnique({
        where: { id: input.capacityDeclarationId },
        include: { artisanProfile: { include: { user: true } } },
      });
      requireRule(
        capacity &&
          !capacity.supersededAt &&
          capacity.unitType === 'PIECES' &&
          capacity.craftSkillId === order.rfq.craftSkillId &&
          capacity.effectiveFrom <= order.rfq.deliveryAt &&
          capacity.effectiveTo >= order.rfq.deliveryAt &&
          capacity.artisanProfile.user?.status === 'ACTIVE' &&
          capacity.artisanProfile.user.emailVerified,
        'CAPACITY_UNAVAILABLE',
        'Choose a piece-capacity declaration covering this craft and delivery date.',
      );
      requireRule(
        await tx.consentRecord.findFirst({
          where: {
            userId: capacity.artisanProfile.userId ?? 'unlinked-participant-no-legacy-consent',
            purpose: 'artisan.profile',
            decision: true,
            withdrawnAt: null,
          },
        }),
        'CONSENT_REQUIRED',
        'Active artisan processing consent is required.',
      );
      requireRule(
        await tx.artisanSkill.findFirst({
          where: {
            artisanProfileId: capacity.artisanProfileId,
            craftSkillId: order.rfq.craftSkillId,
            craftSkill: { isActive: true },
          },
        }),
        'INVALID_CRAFT',
        'The artisan must have this active craft skill.',
      );
      return this.command(tx, actor, key, order.id, 'offer.create', input, async () => {
        requireRule(
          order.status === 'PLANNING',
          'INVALID_TRANSITION',
          'Plan offers only for a funded order in planning.',
        );
        const expiresAt = new Date(input.expiresAt);
        requireRule(
          expiresAt > new Date() && expiresAt < order.rfq.deliveryAt,
          'INVALID_EXPIRY',
          'Offer expiry must be in the future before delivery.',
        );
        const pay = parseTnd(input.unitPayTnd);
        requireRule(pay > 0n, 'INVALID_AMOUNT', 'Unit pay must be positive.');
        payableForUnits(pay, input.quantity);
        const others = await tx.commercialOffer.findMany({
          where: { capacityDeclarationId: capacity.id },
        });
        const used = others.filter((o) => held(o)).reduce((n, o) => n + o.quantity, 0);
        requireRule(
          BigInt(used + input.quantity) * 100n <= BigInt(capacity.quantity.mul(100).toFixed(0)),
          'CAPACITY_EXCEEDED',
          "This offer exceeds the artisan's remaining declared capacity.",
        );
        const quantities = orderQuantities(order);
        reconcileFulfillment({ ...quantities, reserved: quantities.reserved + input.quantity });
        transitionOffer('PLANNED', 'OFFERED', ['PRODUCTION_MANAGER'], {
          now: Date.now(),
          expiresAt: expiresAt.getTime(),
        });
        const row = await tx.commercialOffer.create({
          data: {
            orderId: order.id,
            capacityDeclarationId: capacity.id,
            artisanProfileId: capacity.artisanProfileId,
            quantity: input.quantity,
            unitPayMillimes: pay,
            estimatedHours: input.estimatedHours,
            expiresAt,
            materials: input.materials,
            reworkTerms: input.reworkTerms,
            paymentConditions: input.paymentConditions,
            status: 'OFFERED',
          },
        });
        await this.event(tx, actor, order.rfq, 'offer.create', 'CommercialOffer', row.id);
        return saved(row);
      });
    });
  }
  async offerAction(actor: Actor, id: string, input: OfferAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, order, capacities: roles } = await this.policy.offer(actor, id, tx);
      if (input.next === 'ACCEPTED' && roles.includes('ARTISAN'))
        await this.requireArtisanConsent(tx, actor);
      roleForNext(roles, input.next, offerEdges);
      return this.command(tx, actor, key, id, 'offer.action', input, async () => {
        version(row.version, input.version);
        transitionOffer(row.status as OfferState, input.next, roles, {
          expiresAt: row.expiresAt.getTime(),
          now: Date.now(),
        });
        requireRule(
          order.status === 'PLANNING',
          'INVALID_TRANSITION',
          'Offer decisions require an order still in planning.',
        );
        if (input.next === 'ACCEPTED') {
          const capacity = await tx.capacityDeclaration.findUniqueOrThrow({
            where: { id: row.capacityDeclarationId },
          });
          const offers = await tx.commercialOffer.findMany({
            where: { capacityDeclarationId: capacity.id },
          });
          requireRule(
            !capacity.supersededAt &&
              BigInt(offers.filter((o) => held(o)).reduce((n, o) => n + o.quantity, 0)) * 100n <=
                BigInt(capacity.quantity.mul(100).toFixed(0)),
            'CAPACITY_UNAVAILABLE',
            'Capacity changed; request a revised offer.',
          );
          await tx.commercialBatch.create({
            data: { orderId: order.id, offerId: id, artisanProfileId: row.artisanProfileId },
          });
        }
        const result = await tx.commercialOffer.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'ACCEPTED'
              ? { acceptedAt: new Date(), decidedByUserId: actor.id }
              : { decidedByUserId: actor.id }),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `offer.${input.next.toLowerCase()}`,
          'CommercialOffer',
          id,
        );
        return saved(result);
      });
    });
  }
  async batchAction(actor: Actor, id: string, input: BatchAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, order, capacities: roles } = await this.policy.batch(actor, id, tx);
      roleForNext(roles, input.next, batchEdges);
      return this.command(tx, actor, key, id, 'batch.action', input, async () => {
        version(row.version, input.version);
        requireRule(
          ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Release and production actions require an order in production/quality review.',
        );
        transitionBatch(row.status as BatchState, input.next, roles, {
          assigned: row.offer.quantity,
          produced: row.produced,
          approved: row.approved,
          pending: row.pending,
          reworkAccepted: input.reworkAccepted,
        });
        if (input.next === 'APPROVED')
          requireRule(row.rejected === 0, 'QUALITY_REQUIRED', 'Resolve rejected units first.');
        const result = await tx.commercialBatch.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'SUBMITTED'
              ? { submitted: row.produced, pending: row.produced - row.approved - row.rejected }
              : {}),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `batch.${input.next.toLowerCase()}`,
          'CommercialBatch',
          id,
        );
        return saved(result);
      });
    });
  }
  async progress(actor: Actor, id: string, input: ProgressInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, order, capacities } = await this.policy.batch(actor, id, tx);
      permit(capacities, ['ARTISAN']);
      return this.command(tx, actor, key, id, 'batch.progress', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'IN_PROGRESS' &&
            ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Only active production accepts cumulative progress.',
        );
        validateProgress(row.offer.quantity, row.produced, input.produced);
        const result = await tx.commercialBatch.update({
          where: { id },
          data: { produced: input.produced, version: { increment: 1 } },
        });
        await this.event(tx, actor, order.rfq, 'batch.progress', 'CommercialBatch', id);
        return saved(result);
      });
    });
  }
  async inspect(actor: Actor, id: string, input: InspectionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, order, capacities } = await this.policy.batch(actor, id, tx);
      permit(capacities, ['QUALITY_INSPECTOR']);
      return this.command(tx, actor, key, id, 'batch.inspect', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'INSPECTION' && ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Start inspection before recording quality outcomes.',
        );
        reconcileInspection(
          row.submitted,
          input.approved,
          input.rejected,
          input.pending,
          row.approved,
        );
        await tx.commercialInspection.create({
          data: {
            batchId: id,
            batchVersion: row.version,
            inspectorId: actor.id,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            submitted: row.submitted,
            defectReason: input.defectReason,
          },
        });
        const result = await tx.commercialBatch.update({
          where: { id },
          data: {
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            version: { increment: 1 },
          },
        });
        await this.event(tx, actor, order.rfq, 'batch.inspect', 'CommercialBatch', id);
        return saved(result);
      });
    });
  }
  async orderAction(actor: Actor, id: string, input: OrderAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, capacities: roles } = await this.policy.order(actor, id, tx);
      roleForNext(roles, input.next, orderEdges);
      return this.command(tx, actor, key, id, 'order.action', input, async () => {
        version(row.version, input.version);
        const q = orderQuantities(row);
        const buyerSettled = sums(
          row.payments.filter((p) => p.kind === 'BUYER_RECEIPT' && p.status === 'SETTLED'),
          (p) => p.amountMillimes,
        );
        const artisanSettled = sums(
          row.payments.filter((p) => p.kind === 'ARTISAN_PAYOUT' && p.status === 'SETTLED'),
          (p) => p.amountMillimes,
        );
        const artisanDue = sums(row.batches, (b) =>
          payableForUnits(row.offers.find((o) => o.id === b.offerId)!.unitPayMillimes, b.approved),
        );
        if (input.next === 'IN_PRODUCTION' && row.rfq.procurementManaged) {
          const sample = await tx.procurementSample.findFirst({
            where: { rfqId: row.rfqId },
            orderBy: { version: 'desc' },
            include: { decision: true },
          });
          const current = await tx.procurementRevision.findFirst({
            where: { rfqId: row.rfqId },
            orderBy: { version: 'desc' },
          });
          requireRule(
            sample?.decision?.decision === 'APPROVED' && sample.revisionId === current?.id,
            'SAMPLE_APPROVAL_REQUIRED',
            'The latest sample and specification require buyer approval before production.',
          );
        }
        transitionOrder(row.status as OrderState, input.next, roles, {
          ...q,
          buyerDue: row.rfq.quoteMillimes!,
          buyerSettled,
          artisanDue,
          artisanSettled,
          materialsResolved:
            row.materialsResolved || Boolean(input.materialsResolved && input.dispositionNote),
          pendingPayments: row.payments.filter(
            (p) => !['SETTLED', 'FAILED', 'CANCELLED'].includes(p.status),
          ).length,
          openDisputes:
            row.payments.filter((p) => p.status === 'DISPUTED').length +
            row.batches.filter((b) => b.status === 'DISPUTED').length,
        });
        const result = await tx.commercialOrder.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'DELIVERED' ? { delivered: q.approved } : {}),
            ...(input.next === 'CLOSED'
              ? { materialsResolved: true, dispositionNote: input.dispositionNote }
              : {}),
          },
        });
        await this.event(
          tx,
          actor,
          row.rfq,
          `order.${input.next.toLowerCase()}`,
          'CommercialOrder',
          id,
        );
        return saved(result);
      });
    });
  }
  async createPayment(actor: Actor, input: PaymentCreate, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row: order, capacities } = await this.policy.order(actor, input.orderId, tx);
      permit(capacities, ['FINANCE_MANAGER']);
      return this.command(tx, actor, key, order.id, 'payment.create', input, async () => {
        requireRule(
          !['CLOSED', 'CANCELLED', 'SETTLED', 'DISPUTED'].includes(order.status),
          'INVALID_TRANSITION',
          'This order cannot receive new simulated payments.',
        );
        const amount = parseTnd(input.amountTnd);
        requireRule(amount > 0n, 'INVALID_AMOUNT', 'Payment amount must be positive.');
        let eligible = order.rfq.quoteMillimes!;
        if (input.kind === 'ARTISAN_PAYOUT') {
          const batch = order.batches.find((b) => b.id === input.batchId);
          requireRule(batch, 'NOT_FOUND', 'Batch is not part of this order.');
          eligible = payableForUnits(
            order.offers.find((o) => o.id === batch.offerId)!.unitPayMillimes,
            batch.approved,
          );
        }
        const payments = order.payments.filter(
          (p) =>
            p.kind === input.kind &&
            (input.kind === 'BUYER_RECEIPT' || p.batchId === input.batchId) &&
            livePayment(p),
        );
        reconcileSettlement(
          eligible,
          sums(
            payments.filter((p) => p.status === 'SETTLED'),
            (p) => p.amountMillimes,
          ),
          sums(
            payments.filter((p) => p.status !== 'SETTLED'),
            (p) => p.amountMillimes,
          ),
          amount,
        );
        const row = await tx.syntheticPayment.create({
          data: {
            orderId: order.id,
            batchId: input.batchId,
            kind: input.kind,
            amountMillimes: amount,
          },
        });
        await this.event(tx, actor, order.rfq, 'payment.create', 'SyntheticPayment', row.id);
        return saved(row);
      });
    });
  }
  async paymentAction(actor: Actor, id: string, input: PaymentAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, order, capacities: roles } = await this.policy.payment(actor, id, tx);
      roleForNext(roles, input.next, paymentEdges);
      return this.command(tx, actor, key, id, 'payment.action', input, async () => {
        version(row.version, input.version);
        requireRule(
          !['CLOSED', 'CANCELLED', 'SETTLED', 'DISPUTED'].includes(order.status),
          'INVALID_TRANSITION',
          'Payments on this order are frozen.',
        );
        transitionPayment(row.status as PaymentState, input.next, roles, {
          provenance: row.provenance as 'SYNTHETIC',
          evidenceType: input.evidenceType,
        });
        const result = await tx.syntheticPayment.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'SETTLED' ? { evidenceType: 'SIMULATED_SETTLEMENT' } : {}),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `payment.${input.next.toLowerCase()}`,
          'SyntheticPayment',
          id,
        );
        return saved(result);
      });
    });
  }
  async workspace(actor: Actor): Promise<CommerceWorkspaceView> {
    // A single transaction and the shared IAM locks keep these cross-table projections consistent.
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.policy.scope(actor, tx);
      const buyers = this.policy.buyerOrganizationIds(scope);
      const operators = this.policy.operatorOrganizationIds(scope);
      const finance = this.policy.operatorOrganizationIds(scope, 'FINANCE_MANAGER');
      const production = this.policy.operatorOrganizationIds(scope, 'PRODUCTION_MANAGER');
      const buyerOrganizations = scope.memberships
        .filter((m) => buyers.includes(m.organizationId))
        .map((m) => ({ id: m.organizationId, name: m.name, permissions: m.permissions }));
      const operatorOrganizations = scope.memberships
        .filter((m) => operators.includes(m.organizationId))
        .map((m) => ({
          id: m.organizationId,
          name: m.name,
          roles: m.roleNames as BusinessRole[],
        }));
      const own = scope.ownArtisanProfileId;
      const rfqs = await tx.commercialRfq.findMany({
        where: this.policy.rfqWhere(scope),
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const orders = await tx.commercialOrder.findMany({
        where: this.policy.orderWhere(scope),
        include: orderInclude,
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const offers = await tx.commercialOffer.findMany({
        where: this.policy.offerWhere(scope),
        include: { order: { include: { rfq: true } } },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const batches = await tx.commercialBatch.findMany({
        where: this.policy.batchWhere(scope),
        include: { offer: true },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const payments = await tx.syntheticPayment.findMany({
        where: this.policy.paymentWhere(scope),
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const candidates = production.length
        ? await tx.capacityDeclaration.findMany({
            where: {
              unitType: 'PIECES',
              supersededAt: null,
              effectiveTo: { gt: new Date() },
              artisanProfile: {
                user: {
                  status: 'ACTIVE',
                  emailVerified: true,
                  consents: {
                    some: { purpose: 'artisan.profile', decision: true, withdrawnAt: null },
                  },
                },
              },
            },
            include: { artisanProfile: { select: { id: true, displayName: true } } },
            take: 100,
          })
        : [];
      return {
        buyerOrganizations,
        operatorOrganizations,
        artisanProfileId: own,
        operatorCatalog: await tx.organization.findMany({
          where: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
          select: { id: true, name: true },
          take: 100,
        }),
        crafts: await tx.craftSkill.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          take: 100,
        }),
        candidates: candidates.map((c) => ({
          capacityDeclarationId: c.id,
          artisanProfileId: c.artisanProfileId,
          displayName: c.artisanProfile.displayName,
          craftSkillId: c.craftSkillId,
          quantity: c.quantity.toString(),
          effectiveFrom: c.effectiveFrom.toISOString(),
          effectiveTo: c.effectiveTo.toISOString(),
        })),
        rfqs: rfqs.map((r) => ({
          id: r.id,
          buyerOrganizationId: r.buyerOrganizationId,
          operatorOrganizationId: r.operatorOrganizationId,
          title: r.title,
          specification: r.specification,
          designRequirements: r.designRequirements,
          craftSkillId: r.craftSkillId,
          quantity: r.quantity,
          deliveryAt: r.deliveryAt.toISOString(),
          deliveryLocation: r.deliveryLocation,
          status: r.status as RfqState,
          version: r.version,
          quoteTnd:
            buyers.includes(r.buyerOrganizationId) || finance.includes(r.operatorOrganizationId)
              ? r.quoteMillimes === null
                ? null
                : formatTnd(r.quoteMillimes)
              : null,
          quoteExpiresAt: r.quoteExpiresAt?.toISOString() ?? null,
          provenance: 'SYNTHETIC',
        })),
        orders: orders.map((o) => ({
          id: o.id,
          rfqId: o.rfqId,
          title: o.rfq.title,
          status: o.status as OrderState,
          version: o.version,
          quantity: o.rfq.quantity,
          allocated: orderQuantities(o).allocated,
          produced: orderQuantities(o).produced,
          approved: orderQuantities(o).approved,
          delivered: o.delivered,
          quoteTnd:
            buyers.includes(o.rfq.buyerOrganizationId) ||
            finance.includes(o.rfq.operatorOrganizationId)
              ? formatTnd(o.rfq.quoteMillimes!)
              : null,
          provenance: 'SYNTHETIC',
          buyerOrganizationId: o.rfq.buyerOrganizationId,
          operatorOrganizationId: o.rfq.operatorOrganizationId,
        })),
        offers: offers.map((o) => {
          const pay =
            o.artisanProfileId === own ||
            finance.includes(o.order.rfq.operatorOrganizationId) ||
            production.includes(o.order.rfq.operatorOrganizationId);
          return {
            id: o.id,
            orderId: o.orderId,
            artisanProfileId: o.artisanProfileId,
            quantity: o.quantity,
            unitPayTnd: pay ? formatTnd(o.unitPayMillimes) : null,
            totalPayTnd: pay ? formatTnd(payableForUnits(o.unitPayMillimes, o.quantity)) : null,
            estimatedHours: o.estimatedHours,
            expiresAt: o.expiresAt.toISOString(),
            materials: o.materials,
            reworkTerms: o.reworkTerms,
            paymentConditions: o.paymentConditions,
            specification: o.order.rfq.specification,
            deliveryAt: o.order.rfq.deliveryAt.toISOString(),
            status: o.status as OfferState,
            version: o.version,
            provenance: 'SYNTHETIC',
          };
        }),
        batches: batches.map((b) => ({
          id: b.id,
          orderId: b.orderId,
          offerId: b.offerId,
          artisanProfileId: b.artisanProfileId,
          status: b.status as BatchState,
          version: b.version,
          quantity: b.offer.quantity,
          produced: b.produced,
          submitted: b.submitted,
          approved: b.approved,
          rejected: b.rejected,
          pending: b.pending,
          provenance: 'SYNTHETIC',
        })),
        payments: payments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          batchId: p.batchId,
          kind: p.kind as 'BUYER_RECEIPT' | 'ARTISAN_PAYOUT',
          amountTnd: formatTnd(p.amountMillimes),
          status: p.status as PaymentState,
          version: p.version,
          evidenceType: p.evidenceType as 'SIMULATED_SETTLEMENT' | null,
          provenance: 'SYNTHETIC',
        })),
      };
    });
  }
}