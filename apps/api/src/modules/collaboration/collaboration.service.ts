import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';
import { ProductionOfferService } from '../procurement/production-offers.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Operational collaboration. A coordinator may add to or act on a report, but never rewrite the
 * artisan's original words. Acceptance of work remains the artisan's own act.
 */
@Injectable()
export class CollaborationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductionOfferService) private readonly offers: ProductionOfferService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async workspace(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      const orderIds = access.orderIds;
      const batchScope =
        access.internal || access.buyer || access.platform
          ? {}
          : {
              batch: {
                artisanProfileId: { in: [access.artisanProfileId ?? '', ...access.coordinatorFor] },
              },
            };
      const [
        exceptions,
        revisions,
        counteroffers,
        pause,
        tickets,
        discussions,
        preferences,
        notifications,
      ] = await Promise.all([
        tx.productionException.findMany({
          where: access.platform
            ? {}
            : { orderId: { in: orderIds.length ? orderIds : [''] }, ...batchScope },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.scheduleRevision.findMany({
          where: access.platform
            ? {}
            : { orderId: { in: orderIds.length ? orderIds : [''] }, ...batchScope },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.counteroffer.findMany({
          include: { offer: true, revisedOffer: true },
          where: access.artisanProfileId
            ? { offer: { artisanProfileId: access.artisanProfileId } }
            : access.platform
              ? {}
              : { offer: { orderId: { in: orderIds.length ? orderIds : [''] } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        access.artisanProfileId
          ? tx.availabilityPause.findFirst({
              where: { artisanProfileId: access.artisanProfileId, resumedAt: null },
              orderBy: { pausedAt: 'desc' },
            })
          : Promise.resolve(null),
        tx.supportTicket.findMany({
          where: access.platform
            ? {}
            : access.supportOperator
              ? {
                  OR: [
                    { reporterId: actor.id },
                    { organizationId: { in: access.supportOrganizationIds } },
                  ],
                }
              : { reporterId: actor.id },
          include: {
            events: { orderBy: { createdAt: 'desc' } },
            attachments: { select: { id: true, filename: true, mime: true, sha256: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.orderDiscussion.findMany({
          where: access.platform ? {} : { orderId: { in: orderIds.length ? orderIds : [''] } },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        tx.notificationPreference.findMany({ where: { userId: actor.id } }),
        tx.notificationDelivery.findMany({
          where: { userId: actor.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

      const view: C.CollaborationWorkspaceView = {
        exceptions: exceptions.map((row) => ({
          id: row.id,
          affectedQuantity: row.affectedQuantity,
          affectedDate: row.affectedDate?.toISOString() ?? null,
          batchId: row.batchId,
          orderId: row.orderId,
          category: row.category as C.ExceptionCategory,
          severity: row.severity,
          description: row.description,
          evidenceReference: row.evidenceReference,
          status: row.status as C.ExceptionState,
          reporterRole: row.reporterRole,
          resolution: row.resolution,
          createdAt: row.createdAt.toISOString(),
          blocksReadiness: C.exceptionBlocksReadiness({
            category: row.category as C.ExceptionCategory,
            severity: row.severity,
            state: row.status as C.ExceptionState,
          }),
        })),
        scheduleRevisions: revisions.map((row) => ({
          id: row.id,
          batchId: row.batchId,
          previousDeadline: row.previousDeadline.toISOString(),
          proposedDeadline: row.proposedDeadline.toISOString(),
          reason: row.reason,
          status: row.status as C.ScheduleRevisionState,
          effect: C.scheduleRevisionEffect({
            status: row.status as C.ScheduleRevisionState,
            previousDeadline: row.previousDeadline.toISOString(),
            proposedDeadline: row.proposedDeadline.toISOString(),
          }),
          impact: row.impact,
          buyerApproved: Boolean(row.buyerApprovedById),
          artisanApproved: Boolean(row.artisanApprovedById),
          createdAt: row.createdAt.toISOString(),
        })),
        counteroffers: counteroffers.map((row) => ({
          id: row.id,
          offerId: row.offerId,
          revisedOfferId: row.revisedOfferId,
          unitPayTnd: C.formatTnd((row.revisedOffer ?? row.offer).unitPayMillimes),
          totalPayTnd: C.formatTnd(
            C.payableForUnits(
              (row.revisedOffer ?? row.offer).unitPayMillimes,
              row.proposedQuantity,
            ),
          ),
          effort:
            row.revisedOffer?.estimatedHours ??
            'Pending manager review; original effort does not imply revised working time.',
          materials: (row.revisedOffer ?? row.offer).materials,
          proposedQuantity: row.proposedQuantity,
          proposedDeadline: row.proposedDeadline.toISOString(),
          clarification: row.clarification,
          status: row.status as C.CounterofferState,
          createsAgreement: C.counterofferCreatesAgreement(row.status as C.CounterofferState),
          createdAt: row.createdAt.toISOString(),
        })),
        availabilityPause: pause
          ? {
              pausedAt: pause.pausedAt.toISOString(),
              effectiveFrom: pause.effectiveFrom.toISOString(),
              reason: pause.reason,
            }
          : null,
        tickets: tickets.map((row) => ({
          id: row.id,
          category: row.category as C.SupportTicketCategory,
          relatedType: row.relatedType,
          relatedId: row.relatedId,
          description: row.description,
          status: row.status as C.SupportTicketState,
          priority: row.priority,
          resolution: row.resolution,
          createdAt: row.createdAt.toISOString(),
          privacyScope: row.privacyScope,
          ownerId: row.ownerId,
          dueAt: row.dueAt?.toISOString() ?? null,
          attachments: row.attachments,
          events: row.events.map((event) => ({
            id: event.id,
            kind: event.kind,
            detail: event.detail,
            createdAt: event.createdAt.toISOString(),
          })),
        })),
        discussions: discussions.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          body:
            row.messages.find((message) => !message.internalOnly || access.internal)?.body ?? '',
          createdAt: row.createdAt.toISOString(),
          messages: row.messages
            .filter((message) => !message.internalOnly || access.internal)
            .map((message) => ({
              id: message.id,
              body: message.body,
              internalOnly: message.internalOnly,
              deliveryStatus: 'STORED',
              createdAt: message.createdAt.toISOString(),
            })),
        })),
        notificationPreferences: preferences.map((row) => ({
          category: row.category,
          channel: row.channel,
          optedIn: row.optedIn,
        })),
        notifications: notifications.map((row) => ({
          id: row.id,
          category: row.category,
          channel: row.channel,
          subject: row.subject,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
        limitations: [
          'A coordinator can add information to a report but cannot overwrite the artisan statement.',
          'A proposed schedule change does not alter the agreed deadline until it is approved.',
          'A counteroffer is not an acceptance and creates no capacity commitment.',
          'Internal financial detail is never visible to buyers in a discussion.',
          'External notification channels stay undeliverable until a provider is configured.',
        ],
      };
      return view;
    });
  }

  async reportException(actor: Actor, input: C.ExceptionReportInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await tx.commercialBatch.findUnique({
        where: { id: input.batchId },
        include: { order: { include: { rfq: true } } },
      });
      if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
      const access = await this.access(tx, actor);
      const permitted =
        access.platform ||
        access.artisanProfileId === batch.artisanProfileId ||
        access.coordinatorFor.includes(batch.artisanProfileId) ||
        access.operatorOrganizationIds.includes(batch.order.rfq.operatorOrganizationId);
      if (!permitted) fail(404, 'NOT_FOUND', 'Batch not found.');
      return this.command(tx, actor, input.batchId, 'exception.report', key, input, async () => {
        const reported = await tx.productionException.create({
          data: {
            batchId: batch.id,
            orderId: batch.orderId,
            reporterId: actor.id,
            reporterRole:
              access.artisanProfileId === batch.artisanProfileId ? 'ARTISAN' : 'COORDINATOR',
            category: input.category,
            severity: input.severity,
            description: input.description,
            evidenceReference: input.evidenceReference,
            affectedQuantity: input.affectedQuantity ?? null,
            affectedDate: input.affectedDate ? new Date(input.affectedDate) : null,
            status: 'OPEN',
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.exception.reported',
          targetType: 'ProductionException',
          targetId: reported.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          after: {
            category: input.category,
            severity: input.severity,
            status: 'OPEN',
            provenance: 'SYNTHETIC',
          },
        });
        // The responsible coordinator is the operator organization's members for this buyer, plus
        // the reporter so they see their own report was received.
        const coordinators = await tx.operatorAssignment.findMany({
          where: { organizationId: batch.order.rfq.buyerOrganizationId, revokedAt: null },
          select: { operatorId: true },
          take: 10,
        });
        const assigned = await tx.artisanAssignment.findMany({
          where: { artisanProfileId: batch.artisanProfileId, endedAt: null },
          select: { coordinatorId: true },
        });
        const recipients = [
          ...new Set([
            actor.id,
            ...coordinators.map((row) => row.operatorId),
            ...assigned.map((row) => row.coordinatorId),
          ]),
        ];
        for (const recipient of recipients) {
          await this.notify(tx, {
            userId: recipient,
            category: 'PRODUCTION_EXCEPTION',
            subject: 'Production exception recorded',
            body: `An exception was recorded on batch ${batch.id.slice(0, 8)}.`,
          });
        }
        return { id: reported.id, status: reported.status };
      });
    });
  }

  async updateException(
    actor: Actor,
    exceptionId: string,
    input: C.ExceptionUpdateInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const exception = await tx.productionException.findUnique({
        where: { id: exceptionId },
        include: { batch: true },
      });
      if (!exception) fail(404, 'NOT_FOUND', 'Exception not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.coordinatorFor.includes(exception.batch.artisanProfileId) &&
        !access.operatorOrganizationIds.includes(
          (
            await tx.commercialOrder.findUniqueOrThrow({
              where: { id: exception.orderId },
              include: { rfq: true },
            })
          ).rfq.operatorOrganizationId,
        )
      )
        fail(403, 'FORBIDDEN', 'An assigned coordinator may act on this exception.');
      return this.command(tx, actor, exceptionId, 'exception.update', key, input, async () => {
        if (!C.canTransitionException(exception.status as C.ExceptionState, input.status))
          fail(409, 'INVALID_TRANSITION', 'This exception cannot move to that state.');
        if (input.status === 'RESOLVED' && !input.resolution)
          fail(400, 'RESOLUTION_REQUIRED', 'Record what resolved the exception.');
        const updated = await tx.productionException.update({
          where: { id: exceptionId },
          data: {
            status: input.status,
            resolution: input.resolution || exception.resolution,
            assignedCoordinatorId: actor.id,
            resolvedAt: input.status === 'RESOLVED' ? new Date() : exception.resolvedAt,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.exception.updated',
          targetType: 'ProductionException',
          targetId: exceptionId,
          reason: input.resolution || undefined,
          after: {
            status: updated.status,
            originalReportPreserved: true,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async proposeSchedule(actor: Actor, input: C.ScheduleRevisionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await tx.commercialBatch.findUnique({
        where: { id: input.batchId },
        include: { offer: true, order: { include: { rfq: true } } },
      });
      if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.operatorOrganizationIds.includes(batch.order.rfq.operatorOrganizationId) &&
        !access.coordinatorFor.includes(batch.artisanProfileId)
      )
        fail(403, 'FORBIDDEN', 'A coordinator proposes the schedule; the buyer approves it.');
      return this.command(tx, actor, input.batchId, 'schedule.propose', key, input, async () => {
        const previous = batch.offer.deliveryDeadline ?? batch.order.rfq.deliveryAt;
        const effect = C.scheduleRevisionEffect({
          status: 'PENDING_APPROVAL',
          previousDeadline: previous.toISOString(),
          proposedDeadline: input.proposedDeadline,
        });
        const declaration = await tx.capacityDeclaration.findUniqueOrThrow({
          where: { id: batch.offer.capacityDeclarationId },
        });
        const exceptions = await tx.productionException.findMany({
          where: { batchId: batch.id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
          select: {
            id: true,
            category: true,
            severity: true,
            affectedQuantity: true,
            affectedDate: true,
          },
        });
        const created = await tx.scheduleRevision.create({
          data: {
            batchId: batch.id,
            orderId: batch.orderId,
            proposedDeadline: new Date(input.proposedDeadline),
            previousDeadline: previous,
            reason: input.reason,
            impact: json({
              offerVersion: batch.offer.version,
              buyerDeadline: batch.order.rfq.deliveryAt.toISOString(),
              capacityPeriod: {
                from: declaration.effectiveFrom.toISOString(),
                to: declaration.effectiveTo.toISOString(),
                requiresReassessment:
                  new Date(input.proposedDeadline) >= declaration.effectiveTo ||
                  new Date(input.proposedDeadline) < declaration.effectiveFrom,
              },
              materialImpact: {
                unresolvedExceptions: exceptions
                  .filter((row) => row.category === 'MATERIAL_SHORTAGE')
                  .map((row) => row.id),
                confirmation: 'REQUIRES_COORDINATOR_REVIEW',
              },
              transportImpact: {
                confirmation: 'UNKNOWN_REQUIRES_COORDINATOR_REVIEW',
                buyerDeliveryAt: batch.order.rfq.deliveryAt.toISOString(),
              },
              deltaDays: effect.deltaDays,
              requiresBuyerApproval: effect.requiresBuyerApproval,
              acceptedQuantityUnchanged: true,
              agreedCompensationUnchanged: true,
            }),
            status: 'PENDING_APPROVAL',
            authorId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.schedule.proposed',
          targetType: 'ScheduleRevision',
          targetId: created.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          reason: input.reason,
          after: {
            previousDeadline: previous.toISOString(),
            proposedDeadline: input.proposedDeadline,
            pendingApproval: true,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: created.id, status: created.status, effect };
      });
    });
  }

  async decideSchedule(
    actor: Actor,
    revisionId: string,
    input: C.ScheduleDecisionInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const revision = await tx.scheduleRevision.findUnique({
        where: { id: revisionId },
        include: { order: { include: { rfq: true } } },
      });
      if (!revision) fail(404, 'NOT_FOUND', 'Schedule revision not found.');
      // A deadline extension changes a buyer commitment, so the buyer decides it.
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: revision.order.rfq.buyerOrganizationId,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      const buyerAuthority = Boolean(
        member && C.permissionsForMembership(member).includes('buyer.quotation.approve'),
      );
      const batch = await tx.commercialBatch.findUniqueOrThrow({
        where: { id: revision.batchId },
        include: { offer: true },
      });
      const access = await this.access(tx, actor);
      const artisanAuthority = access.artisanProfileId === batch.artisanProfileId;
      // Platform administration is governance, not a party to the contract. It may not approve a
      // change to agreed terms in a buyer's or artisan's place.
      if (!buyerAuthority && !artisanAuthority)
        fail(
          403,
          'FORBIDDEN',
          'Only an affected party (the buying organization or the assigned artisan) can decide this change.',
        );
      return this.command(tx, actor, revisionId, 'schedule.decide', key, input, async () => {
        if (!['PENDING_APPROVAL', 'AWAITING_ARTISAN'].includes(revision.status))
          fail(409, 'INVALID_TRANSITION', 'This schedule change is already decided.');
        const currentDeadline = batch.offer.deliveryDeadline ?? revision.order.rfq.deliveryAt;
        if (
          currentDeadline.getTime() !== revision.previousDeadline.getTime() ||
          (revision.impact as { offerVersion?: number }).offerVersion !== batch.offer.version
        )
          fail(
            409,
            'STALE_PROPOSAL',
            'The effective agreement changed. Propose and review new dates.',
          );
        const now = new Date();
        if (input.decision === 'REJECTED') {
          const rejected = await tx.scheduleRevision.update({
            where: { id: revisionId },
            data: {
              status: 'REJECTED',
              approvedById: actor.id,
              approvedAt: now,
            },
          });
          await audit(tx, actor, {
            action: 'collaboration.schedule.rejected',
            targetType: 'ScheduleRevision',
            targetId: revisionId,
            organizationId: revision.order.rfq.buyerOrganizationId,
            reason: input.note || undefined,
            after: { status: rejected.status, deadlineApplied: false, provenance: 'SYNTHETIC' },
          });
          await this.notify(tx, {
            userId: revision.authorId,
            category: 'SCHEDULE_CHANGE',
            subject: 'Schedule decision',
            body: 'Review the rejected schedule proposal in your authenticated workspace.',
          });
          return {
            id: rejected.id,
            status: rejected.status,
            effectiveDeadline: revision.previousDeadline.toISOString(),
          };
        }
        // The buyer's approval always applies. The artisan's approval is additionally required
        // because a later delivery date changes their own agreed commitment and compensation basis.
        const buyerApproved = buyerAuthority || Boolean(revision.buyerApprovedById);
        const artisanApproved = artisanAuthority || Boolean(revision.artisanApprovedById);
        const status = buyerApproved && artisanApproved ? 'APPROVED' : 'AWAITING_ARTISAN';
        const updated = await tx.scheduleRevision.update({
          where: { id: revisionId },
          data: {
            status,
            approvedById: buyerApproved && artisanApproved ? actor.id : revision.approvedById,
            approvedAt: buyerApproved && artisanApproved ? now : revision.approvedAt,
            ...(buyerAuthority && !revision.buyerApprovedById
              ? { buyerApprovedById: actor.id, buyerApprovedAt: now }
              : {}),
            ...(artisanAuthority && !revision.artisanApprovedById
              ? { artisanApprovedById: actor.id, artisanApprovedAt: now }
              : {}),
          },
        });
        if (
          status === 'APPROVED' &&
          (revision.impact as { capacityPeriod?: { requiresReassessment?: boolean } })
            .capacityPeriod?.requiresReassessment
        )
          fail(
            409,
            'CAPACITY_REASSESSMENT_REQUIRED',
            'The proposed date falls outside approved capacity. Reassess the period before changing this commitment.',
          );
        if (status === 'APPROVED')
          await tx.commercialOffer.update({
            where: { id: batch.offerId },
            data: { deliveryDeadline: revision.proposedDeadline, version: { increment: 1 } },
          });
        await audit(tx, actor, {
          action: `collaboration.schedule.${status === 'APPROVED' ? 'approved' : 'buyer_approved'}`,
          targetType: 'ScheduleRevision',
          targetId: revisionId,
          organizationId: revision.order.rfq.buyerOrganizationId,
          reason: input.note || undefined,
          after: {
            status,
            deadlineApplied: status === 'APPROVED',
            buyerApproved: buyerApproved,
            artisanApproved: artisanApproved,
            provenance: 'SYNTHETIC',
          },
        });
        await this.notify(tx, {
          userId: revision.authorId,
          category: 'SCHEDULE_CHANGE',
          subject: 'Schedule decision',
          body: 'Review the recorded party decision in your authenticated workspace.',
        });
        return {
          id: updated.id,
          status: updated.status,
          effectiveDeadline: (status === 'APPROVED'
            ? revision.proposedDeadline
            : revision.previousDeadline
          ).toISOString(),
        };
      });
    });
  }

  async counter(actor: Actor, input: C.CounterofferInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const offer = await tx.commercialOffer.findUnique({ where: { id: input.offerId } });
      if (!offer) fail(404, 'NOT_FOUND', 'Offer not found.');
      const access = await this.access(tx, actor);
      if (access.artisanProfileId !== offer.artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan receiving an offer can counter it.');
      return this.command(tx, actor, input.offerId, 'counter.propose', key, input, async () => {
        if (!['PLANNED', 'OFFERED'].includes(offer.status))
          fail(409, 'OFFER_NOT_OPEN', 'Only an open offer can be countered.');
        if (offer.expiresAt <= new Date()) fail(409, 'OFFER_EXPIRED', 'This offer has expired.');
        const created = await tx.counteroffer.create({
          data: {
            offerId: input.offerId,
            proposedQuantity: input.proposedQuantity,
            proposedDeadline: new Date(input.proposedDeadline),
            clarification: input.clarification,
            status: 'PROPOSED',
            authorUserId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.proposed',
          targetType: 'Counteroffer',
          targetId: created.id,
          after: {
            offerId: input.offerId,
            proposedQuantity: input.proposedQuantity,
            createsAgreement: false,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: created.id, status: created.status };
      });
    });
  }

  async reviewCounter(
    actor: Actor,
    counterId: string,
    input: C.CounterofferReviewInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const counter = await tx.counteroffer.findUnique({
        where: { id: counterId },
        include: { offer: { include: { order: { include: { rfq: true } } } } },
      });
      if (!counter) fail(404, 'NOT_FOUND', 'Counteroffer not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.operatorOrganizationIds.includes(counter.offer.order.rfq.operatorOrganizationId)
      )
        fail(403, 'FORBIDDEN', 'A manager reviews changed terms.');
      return this.command(tx, actor, counterId, 'counter.review', key, input, async () => {
        if (counter.status !== 'PROPOSED')
          fail(409, 'INVALID_TRANSITION', 'This counteroffer is already reviewed.');
        const target = input.decision === 'APPROVE_TERMS' ? 'MANAGER_REVIEW' : 'DECLINED';
        const revised =
          input.decision === 'APPROVE_TERMS'
            ? await this.offers.reissueCounter(
                tx,
                actor,
                counter.offerId,
                counter.proposedQuantity,
                counter.proposedDeadline,
              )
            : null;
        const updated = await tx.counteroffer.update({
          where: { id: counterId },
          data: {
            status: target,
            reviewedById: actor.id,
            reviewNote: input.note,
            revisedOfferId: revised?.id,
            originalTerms: json({
              offerId: counter.offer.id,
              quantity: counter.offer.quantity,
              unitPayTnd: C.formatTnd(counter.offer.unitPayMillimes),
              deadline: (
                counter.offer.deliveryDeadline ?? counter.offer.order.rfq.deliveryAt
              ).toISOString(),
              termsSha256: counter.offer.termsSha256,
              version: counter.offer.version,
            }),
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.reviewed',
          targetType: 'Counteroffer',
          targetId: counterId,
          after: {
            status: updated.status,
            // A manager approving terms is still not the artisan's acceptance.
            createsAgreement: false,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          id: updated.id,
          status: updated.status,
          createsAgreement: false,
          revisedOfferId: revised?.id ?? null,
        };
      });
    });
  }

  /** The artisan explicitly accepts the final terms. This is the only path to agreement. */
  async acceptCounter(actor: Actor, counterId: string, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const counter = await tx.counteroffer.findUnique({
        where: { id: counterId },
        include: { offer: true },
      });
      if (!counter) fail(404, 'NOT_FOUND', 'Counteroffer not found.');
      const access = await this.access(tx, actor);
      if (access.artisanProfileId !== counter.offer.artisanProfileId)
        fail(403, 'FORBIDDEN', 'The artisan must accept the final terms personally.');
      return this.command(tx, actor, counterId, 'counter.accept', key, {}, async () => {
        if (counter.status !== 'MANAGER_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'Final terms are accepted after manager review.');
        const acceptedOffer = counter.revisedOfferId
          ? await tx.commercialOffer.findUnique({
              where: { id: counter.revisedOfferId },
              include: { batch: true },
            })
          : null;
        if (
          acceptedOffer?.status !== 'ACCEPTED' ||
          !acceptedOffer.batch ||
          acceptedOffer.decidedByUserId !== actor.id ||
          acceptedOffer.quantity !== counter.proposedQuantity ||
          acceptedOffer.deliveryDeadline?.getTime() !== counter.proposedDeadline.getTime()
        )
          fail(
            409,
            'EXPLICIT_OFFER_ACCEPTANCE_REQUIRED',
            'Review and explicitly accept the newly issued version in My offers first. Manager review does not create consent.',
          );
        const updated = await tx.counteroffer.update({
          where: { id: counterId },
          data: {
            status: 'ARTISAN_ACCEPTED',
            acceptedById: actor.id,
            acceptedAt: new Date(),
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.accepted',
          targetType: 'Counteroffer',
          targetId: counterId,
          after: {
            status: updated.status,
            createsAgreement: true,
            quantity: counter.proposedQuantity,
            deadline: counter.proposedDeadline.toISOString(),
            offerVersion: acceptedOffer.version,
            offerStatus: acceptedOffer.status,
            termsSha256: acceptedOffer.termsSha256,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          id: updated.id,
          status: updated.status,
          createsAgreement: true,
          offerId: acceptedOffer.id,
          offerStatus: acceptedOffer.status,
          quantity: counter.proposedQuantity,
          deadline: counter.proposedDeadline.toISOString(),
        };
      });
    });
  }

  async pauseAvailability(actor: Actor, input: C.AvailabilityPauseInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      const artisanProfileId = access.artisanProfileId;
      if (!artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan can pause their own availability.');
      const profileId: string = artisanProfileId;
      return this.command(tx, actor, profileId, 'availability.pause', key, input, async () => {
        const existing = await tx.availabilityPause.findFirst({
          where: { artisanProfileId: profileId, resumedAt: null },
        });
        if (existing) fail(409, 'ALREADY_PAUSED', 'Availability is already paused.');
        const pause = await tx.availabilityPause.create({
          data: {
            artisanProfileId: profileId,
            reason: input.reason,
            effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
            actorId: actor.id,
          },
        });
        if (!input.effectiveFrom || new Date(input.effectiveFrom) <= new Date())
          await tx.artisanProfile.update({
            where: { id: profileId },
            data: { availabilityStatus: 'PAUSED' },
          });
        await audit(tx, actor, {
          action: 'collaboration.availability.paused',
          targetType: 'ArtisanProfile',
          targetId: profileId,
          after: {
            reason: input.reason,
            acceptedCommitmentsPreserved: true,
            fairnessEligibilityUnchanged: true,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          pausedAt: pause.pausedAt.toISOString(),
          effectiveFrom: pause.effectiveFrom.toISOString(),
          reason: pause.reason,
        };
      });
    });
  }

  async resumeAvailability(actor: Actor, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan can resume their own availability.');
      const profileId: string = access.artisanProfileId;
      return this.command(tx, actor, profileId, 'availability.resume', key, {}, async () => {
        const pause = await tx.availabilityPause.findFirst({
          where: { artisanProfileId: profileId, resumedAt: null },
        });
        if (!pause) fail(409, 'NOT_PAUSED', 'Availability is not paused.');
        await tx.availabilityPause.update({
          where: { id: pause.id },
          data: { resumedAt: new Date(), resumedById: actor.id },
        });
        await tx.artisanProfile.update({
          where: { id: profileId },
          data: { availabilityStatus: 'AVAILABLE' },
        });
        await audit(tx, actor, {
          action: 'collaboration.availability.resumed',
          targetType: 'ArtisanProfile',
          targetId: profileId,
          after: { provenance: 'SYNTHETIC' },
        });
        return { available: true };
      });
    });
  }

  async createTicket(actor: Actor, input: C.TicketCreateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      let supportOrganizationId = access.organizationIds[0] ?? null;
      if (input.relatedType === 'PAYABLE') {
        const payable = await tx.artisanPayable.findUnique({
          where: { id: input.relatedId ?? '' },
          include: { order: { include: { rfq: true } }, sampleRequest: true },
        });
        const organizationId =
          payable?.order?.rfq.operatorOrganizationId ??
          payable?.sampleRequest?.operatorOrganizationId;
        if (
          !payable ||
          !organizationId ||
          !(
            payable.artisanProfileId === access.artisanProfileId ||
            access.supportOrganizationIds.includes(organizationId)
          )
        )
          fail(404, 'NOT_FOUND', 'Related resource not found.');
        supportOrganizationId = organizationId;
      } else if (input.relatedType !== 'NONE') {
        const orderId =
          input.relatedType === 'ORDER'
            ? input.relatedId
            : input.relatedType === 'BATCH'
              ? (await tx.commercialBatch.findUnique({ where: { id: input.relatedId ?? '' } }))
                  ?.orderId
              : input.relatedType === 'OFFER'
                ? (await tx.commercialOffer.findUnique({ where: { id: input.relatedId ?? '' } }))
                    ?.orderId
                : null;
        if (!orderId || (!access.platform && !access.orderIds.includes(orderId)))
          fail(
            404,
            'NOT_FOUND',
            'Related resource not found. Use the independent finance dispute workflow for payable remedies.',
          );
        supportOrganizationId = (
          await tx.commercialOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { rfq: true },
          })
        ).rfq.operatorOrganizationId;
      }
      return this.command(tx, actor, actor.id, 'ticket.create', key, input, async () => {
        const ticket = await tx.supportTicket.create({
          data: {
            category: input.category,
            relatedType: input.relatedType === 'NONE' ? null : input.relatedType,
            relatedId: input.relatedId,
            reporterId: actor.id,
            organizationId: supportOrganizationId,
            description: input.description,
            evidenceReference: input.evidenceReference,
            privacyScope: input.privacyScope,
            dueAt: new Date(Date.now() + (input.priority === 'HIGH' ? 86400000 : 3 * 86400000)),
            priority: input.priority,
            status: 'OPEN',
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId: ticket.id,
            actorId: actor.id,
            kind: 'OPENED',
            detail: input.description,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.ticket.opened',
          targetType: 'SupportTicket',
          targetId: ticket.id,
          organizationId: ticket.organizationId ?? undefined,
          after: { category: input.category, status: 'OPEN', provenance: 'SYNTHETIC' },
        });
        return { id: ticket.id, status: ticket.status };
      });
    });
  }

  async updateTicket(actor: Actor, ticketId: string, input: C.TicketUpdateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) fail(404, 'NOT_FOUND', 'Support case not found.');
      const access = await this.access(tx, actor);
      const permitted =
        access.platform ||
        access.supportOrganizationIds.includes(ticket.organizationId ?? '') ||
        (ticket.reporterId === actor.id && ['WITHDRAWN', 'CLOSED'].includes(input.status));
      if (!permitted) fail(403, 'FORBIDDEN', 'Support case management authority is required.');
      return this.command(tx, actor, ticketId, 'ticket.update', key, input, async () => {
        if (!C.canTransitionTicket(ticket.status as C.SupportTicketState, input.status))
          fail(409, 'INVALID_TRANSITION', 'This support case cannot move to that state.');
        if (input.ownerId) {
          const owner = await tx.organizationMember.findFirst({
            where: {
              userId: input.ownerId,
              organizationId: ticket.organizationId ?? '',
              status: 'ACTIVE',
            },
            include: { roles: true, permissionGrants: true, organization: true },
          });
          if (!owner || !C.permissionsForMembership(owner).includes('support.case.manage'))
            fail(403, 'INVALID_OWNER', 'The owner needs support permission in this organization.');
        }
        if (input.status === 'RESOLVED' && !input.resolution)
          fail(400, 'RESOLUTION_REQUIRED', 'Describe the resolution and any independent remedy.');
        const updated = await tx.supportTicket.update({
          where: { id: ticketId },
          data: {
            status: input.status,
            resolution: input.resolution || ticket.resolution,
            ownerId:
              input.ownerId ?? ticket.ownerId ?? (ticket.reporterId === actor.id ? null : actor.id),
            dueAt: input.dueAt ? new Date(input.dueAt) : ticket.dueAt,
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId,
            actorId: actor.id,
            kind: `STATUS_${input.status}`,
            detail: `${input.resolution || 'Status updated.'}${input.remedyReference ? ` Remedy: ${input.remedyReference}` : ''}`,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.ticket.updated',
          targetType: 'SupportTicket',
          targetId: ticketId,
          organizationId: ticket.organizationId ?? undefined,
          reason: input.resolution || undefined,
          after: { status: updated.status, provenance: 'SYNTHETIC' },
        });
        await this.notify(tx, {
          userId: ticket.reporterId,
          category: 'SUPPORT_CASE_UPDATE',
          subject: 'Support case updated',
          body: `Your support case is now ${input.status.toLowerCase().replace(/_/g, ' ')}.`,
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async postDiscussion(actor: Actor, orderId: string, input: C.DiscussionPostInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.platform && !access.orderIds.includes(orderId))
        fail(404, 'NOT_FOUND', 'Order not found.');
      return this.command(tx, actor, orderId, 'discussion.post', key, input, async () => {
        if (input.internalOnly && !access.internal)
          fail(403, 'FORBIDDEN', 'Internal notes require operator authority.');
        const safeBody = C.sanitizeDiscussionBody(input.body);
        if (safeBody.length < 2)
          fail(400, 'EMPTY_MESSAGE', 'A discussion message needs visible text.');
        const discussion = await tx.orderDiscussion.findFirst({ where: { orderId } });
        const target =
          discussion ??
          (await tx.orderDiscussion.create({
            data: {
              orderId,
              authorId: actor.id,
              authorOrganizationId: access.organizationIds[0] ?? null,
              body: safeBody,
            },
          }));
        const message = await tx.discussionMessage.create({
          data: {
            discussionId: target.id,
            authorId: actor.id,
            body: safeBody,
            internalOnly: input.internalOnly,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.discussion.posted',
          targetType: 'OrderDiscussion',
          targetId: target.id,
          after: {
            orderId,
            internalOnly: input.internalOnly,
            containsFinancialDetail: false,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: message.id };
      });
    });
  }

  async setPreference(actor: Actor, input: C.NotificationPreferenceInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      return this.command(tx, actor, actor.id, 'notification.preference', key, input, async () => {
        if (input.language)
          await tx.user.update({
            where: { id: actor.id },
            data: { preferredLanguage: input.language },
          });
        const row = await tx.notificationPreference.upsert({
          where: {
            userId_channel_category: {
              userId: actor.id,
              channel: input.channel as 'EMAIL',
              category: input.category,
            },
          },
          create: {
            userId: actor.id,
            channel: input.channel as 'EMAIL',
            category: input.category,
            optedIn: input.optedIn,
            language: input.language,
          },
          update: {
            optedIn: input.optedIn,
            ...(input.language ? { language: input.language } : {}),
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.notification.preference',
          targetType: 'NotificationPreference',
          targetId: row.id,
          after: {
            category: input.category,
            channel: input.channel,
            optedIn: input.optedIn,
            consentBasis: 'EXPLICIT_USER_PREFERENCE',
            language: input.language ?? null,
            provenance: 'SYNTHETIC',
          },
        });
        return { category: row.category, channel: row.channel, optedIn: row.optedIn };
      });
    });
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Record a notification honestly. External channels without a provider are stored as
   * UNDELIVERABLE and never as sent.
   */
  private async notify(
    tx: Db,
    input: { userId: string; category: C.NotificationCategory; subject: string; body: string },
  ) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: input.userId, category: input.category },
    });
    const preference =
      preferences.find((row) => row.optedIn && row.channel === 'IN_APP') ??
      preferences.find((row) => row.optedIn) ??
      preferences[0];
    const plan = C.notificationPlan({
      category: input.category,
      preference: preference ?? null,
      providerConfigured: this.config.NOTIFICATION_EMAIL_ENABLED,
    });
    const template = C.localizedNotification(
      input.category,
      preference?.language ?? user.preferredLanguage,
    );
    return tx.notificationDelivery.create({
      data: {
        userId: input.userId,
        category: input.category,
        channel: plan.channel ?? C.inAppChannel,
        subject: template.subject,
        body: `${template.body} ${this.config.PUBLIC_APP_URL}/collaboration`,
        locale: template.locale,
        status: plan.deliver && plan.channel === C.inAppChannel ? 'DELIVERED' : plan.status,
        provider: plan.channel ?? C.inAppChannel,
        failureReason: plan.deliver ? '' : plan.note,
        deliveredAt: plan.deliver && plan.channel === C.inAppChannel ? new Date() : null,
      },
    });
  }

  async retryNotification(actor: Actor, deliveryId: string, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.notificationDelivery.findFirst({
        where: { id: deliveryId, userId: actor.id },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Notification not found.');
      return this.command(tx, actor, deliveryId, 'notification.retry', key, {}, async () => {
        if (['DELIVERED', 'SENT', 'PENDING'].includes(row.status))
          return { id: row.id, status: row.status };
        if (['SENDING', 'UNCERTAIN'].includes(row.status))
          fail(
            409,
            'DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN',
            'Delivery acknowledgement is uncertain. Review provider evidence before creating another notification.',
          );
        const preference = await tx.notificationPreference.findFirst({
          where: { userId: actor.id, category: row.category, channel: row.channel as 'EMAIL' },
        });
        const plan = C.notificationPlan({
          category: row.category as C.NotificationCategory,
          preference: preference ?? null,
          providerConfigured: this.config.NOTIFICATION_EMAIL_ENABLED,
        });
        const template = C.localizedNotification(
          row.category as C.NotificationCategory,
          preference?.language ?? 'en',
        );
        const updated = await tx.notificationDelivery.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            locale: template.locale,
            subject: template.subject,
            body: `${template.body} ${this.config.PUBLIC_APP_URL}/collaboration`,
            status: plan.deliver && plan.channel === C.inAppChannel ? 'DELIVERED' : plan.status,
            failureReason: plan.deliver ? '' : plan.note,
            deliveredAt: plan.deliver && plan.channel === C.inAppChannel ? new Date() : null,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.notification.retried',
          targetType: 'NotificationDelivery',
          targetId: row.id,
          before: { status: row.status, attempts: row.attempts, failureReason: row.failureReason },
          after: { status: updated.status, attempts: updated.attempts },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async correctTicket(actor: Actor, ticketId: string, input: { detail: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticketId, reporterId: actor.id },
      });
      if (!ticket) fail(404, 'NOT_FOUND', 'Support case not found.');
      return this.command(tx, actor, ticketId, 'ticket.correct', key, input, async () => {
        const event = await tx.supportTicketEvent.create({
          data: { ticketId, actorId: actor.id, kind: 'REPORTER_CORRECTION', detail: input.detail },
        });
        return { id: event.id, originalPreserved: true };
      });
    });
  }

  private async ticketAccess(tx: Db, actor: Actor, ticketId: string) {
    const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    const access = await this.access(tx, actor);
    if (
      !ticket ||
      !(
        ticket.reporterId === actor.id ||
        access.platform ||
        access.supportOrganizationIds.includes(ticket.organizationId ?? '')
      )
    )
      fail(404, 'NOT_FOUND', 'Support case not found.');
    return ticket;
  }

  async addAttachment(
    actor: Actor,
    ticketId: string,
    input: { filename: string; mime: string; base64: string },
    key?: string,
  ) {
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 262144 || !bytes.length)
      fail(400, 'INVALID_IMAGE', 'Use an image under 256 KiB.');
    let clean: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' });
      const metadata = await image.metadata();
      const types = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
      if (types[metadata.format as keyof typeof types] !== input.mime || (metadata.pages ?? 1) > 1)
        throw Error();
      clean = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      if (clean.length > 262144) throw Error();
    } catch {
      fail(400, 'INVALID_IMAGE', 'Use a valid PNG, JPEG or WebP image under 256 KiB.');
    }
    return iamTransaction(this.db, actor, async (tx) => {
      await this.ticketAccess(tx, actor, ticketId);
      return this.command(
        tx,
        actor,
        ticketId,
        'ticket.attachment',
        key,
        { filename: input.filename, sha256: createHash('sha256').update(bytes).digest('hex') },
        async () => {
          if ((await tx.supportTicketAttachment.count({ where: { ticketId } })) >= 5)
            fail(409, 'ATTACHMENT_LIMIT', 'At most five images are allowed.');
          const row = await tx.supportTicketAttachment.create({
            data: {
              ticketId,
              authorId: actor.id,
              filename: `${input.filename.replace(/\.[^.]+$/, '')}.webp`,
              mime: 'image/webp',
              bytes: new Uint8Array(clean),
              sha256: createHash('sha256').update(clean).digest('hex'),
            },
          });
          await tx.supportTicketEvent.create({
            data: { ticketId, actorId: actor.id, kind: 'ATTACHMENT_ADDED', detail: row.id },
          });
          return { id: row.id, sha256: row.sha256 };
        },
      );
    });
  }

  async attachment(actor: Actor, ticketId: string, attachmentId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.ticketAccess(tx, actor, ticketId);
      const row = await tx.supportTicketAttachment.findFirst({
        where: { id: attachmentId, ticketId },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Attachment not found.');
      return {
        filename: row.filename,
        mime: row.mime,
        base64: Buffer.from(row.bytes).toString('base64'),
        sha256: row.sha256,
      };
    });
  }

  private async access(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const permissions = new Set(
      members.flatMap((member) => C.permissionsForMembership(member) as string[]),
    );
    const organizationIds = members.map((member) => member.organizationId);
    const profile = await tx.artisanProfile.findUnique({ where: { userId: actor.id } });
    const assignments = await tx.artisanAssignment.findMany({
      where: { coordinatorId: actor.id, endedAt: null, organizationId: { in: organizationIds } },
      select: { artisanProfileId: true },
    });
    const orderIds = new Set<string>();
    if (members.some((member) => member.organization.type === 'BUYER_BUSINESS'))
      for (const row of await tx.commercialOrder.findMany({
        where: { rfq: { buyerOrganizationId: { in: organizationIds } } },
        select: { id: true },
      }))
        orderIds.add(row.id);
    if (members.some((member) => member.organization.type === 'INTERNAL'))
      for (const row of await tx.commercialOrder.findMany({
        where: { rfq: { operatorOrganizationId: { in: organizationIds } } },
        select: { id: true },
      }))
        orderIds.add(row.id);
    if (profile)
      for (const row of await tx.commercialOffer.findMany({
        where: { artisanProfileId: profile.id },
        select: { orderId: true },
      }))
        orderIds.add(row.orderId);
    if (assignments.length)
      for (const row of await tx.commercialOffer.findMany({
        where: { artisanProfileId: { in: assignments.map((a) => a.artisanProfileId) } },
        select: { orderId: true },
      }))
        orderIds.add(row.orderId);
    return {
      platform: permissions.has('platform.roles.manage'),
      internal: members.some((member) => member.organization.type === 'INTERNAL'),
      buyer: members.some((member) => member.organization.type === 'BUYER_BUSINESS'),
      supportOperator: permissions.has('support.case.manage'),
      supportOrganizationIds: members
        .filter((member) => C.permissionsForMembership(member).includes('support.case.manage'))
        .map((member) => member.organizationId),
      organizationIds,
      operatorOrganizationIds: members
        .filter(
          (member) =>
            member.organization.type === 'INTERNAL' &&
            C.permissionsForMembership(member).includes('operator.production.manage'),
        )
        .map((member) => member.organizationId),
      artisanProfileId: profile?.id ?? null,
      coordinatorFor: assignments.map((row) => row.artisanProfileId),
      orderIds: [...orderIds],
    };
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
      { actorId: actor.id, resourceId: id, operation: `collaboration.${operation}`, key },
      json(input),
      fn,
    );
  }
}
