import { Inject, Injectable } from '@nestjs/common';
import type { CommercialRfq, Prisma } from '@prisma/client';
import {
  artisanOwnerPermissions,
  commerceCapacitiesFor,
  permissionsForMembership,
  type CommerceRole,
  type DelegationScope,
  type Permission,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { actionForbidden, outOfPerimeter } from '../../common/errors.js';
import { profileSelect, scopeMap } from '../artisans/artisan.projection.js';
import type { Db } from './transaction.js';

export const orderInclude = { rfq: true, offers: true, batches: true, payments: true } as const;
export type OrderRecord = Prisma.CommercialOrderGetPayload<{ include: typeof orderInclude }>;
export type ScopedMembership = {
  organizationId: string;
  name: string;
  type: string;
  permissions: Permission[];
  // Display data only (workspace views). Authorization always reads `permissions`.
  roleNames: string[];
};
// Everything the caller may touch, loaded once per request. Memberships are only the ACTIVE
// ones of APPROVED organizations, so revoking a membership or role removes access immediately.
export type ActorScope = {
  actorId: string;
  memberships: ScopedMembership[];
  ownArtisanProfileId: string | null;
};
export type ProcurementAccess = {
  buyer: boolean;
  operator: boolean;
  purchasing: boolean;
  negotiating: boolean;
  approving: boolean;
  coordinator: boolean;
};
const NONE = '__none__';

/**
 * Single entry point for resource-scoped authorization.
 *
 * Every resource type exposes the same two things:
 * - a `*Where(scope)` Prisma filter, so list queries only return authorized rows;
 * - a loader that applies that same filter to one id, so detail and mutation requests can
 *   never see a row the list would hide.
 *
 * Out-of-perimeter access always fails with 404 (see common/errors.ts). Capacity checks that
 * happen inside the perimeter fail with 403 through `require`.
 */
@Injectable()
export class ResourcePolicyService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async scope(actor: Actor, db: Db = this.db): Promise<ActorScope> {
    const members = await db.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    const own = await db.artisanProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    return {
      actorId: actor.id,
      memberships: members.map((m) => ({
        organizationId: m.organizationId,
        name: m.organization.name,
        type: m.organization.type,
        permissions: permissionsForMembership(m),
        roleNames: m.roles.map((r) => r.role),
      })),
      ownArtisanProfileId: own?.id ?? null,
    };
  }

  has(scope: ActorScope, organizationId: string, permission: Permission) {
    return scope.memberships.some(
      (m) => m.organizationId === organizationId && m.permissions.includes(permission),
    );
  }
  require(capacities: readonly CommerceRole[], allowed: readonly CommerceRole[]) {
    if (!allowed.some((capacity) => capacities.includes(capacity))) actionForbidden();
  }
  requirePermission(allowed: boolean) {
    if (!allowed) actionForbidden();
  }

  buyerOrganizationIds(scope: ActorScope) {
    return scope.memberships
      .filter((m) => m.type === 'BUYER_BUSINESS' && m.permissions.includes('buyer.rfq.read'))
      .map((m) => m.organizationId);
  }
  operatorOrganizationIds(scope: ActorScope, capacity?: CommerceRole) {
    return scope.memberships
      .filter((m) => {
        if (m.type !== 'INTERNAL') return false;
        const held = commerceCapacitiesFor(m.permissions, 'OPERATOR_SIDE');
        return capacity ? held.includes(capacity) : held.length > 0;
      })
      .map((m) => m.organizationId);
  }
  // Capacities the caller holds on one RFQ, derived from permissions and never from role names.
  rfqCapacities(
    scope: ActorScope,
    rfq: Pick<CommercialRfq, 'buyerOrganizationId' | 'operatorOrganizationId' | 'status'>,
  ): CommerceRole[] {
    const buyer = scope.memberships.find(
      (m) => m.organizationId === rfq.buyerOrganizationId && m.type === 'BUYER_BUSINESS',
    );
    const operator = scope.memberships.find(
      (m) =>
        m.organizationId === rfq.operatorOrganizationId &&
        m.type === 'INTERNAL' &&
        rfq.status !== 'DRAFT',
    );
    return [
      ...(buyer ? commerceCapacitiesFor(buyer.permissions, 'BUYER_SIDE') : []),
      ...(operator ? commerceCapacitiesFor(operator.permissions, 'OPERATOR_SIDE') : []),
    ];
  }
  // The artisan acts on a resource only through owning the linked profile.
  artisanCapacity(scope: ActorScope, artisanProfileId: string, permission: Permission) {
    return scope.ownArtisanProfileId === artisanProfileId &&
      artisanOwnerPermissions.includes(permission)
      ? (['ARTISAN'] as CommerceRole[])
      : [];
  }

  // ---- Prisma filters for lists (and for the single-row loaders below) ----
  rfqWhere(scope: ActorScope): Prisma.CommercialRfqWhereInput {
    return {
      OR: [
        { buyerOrganizationId: { in: this.buyerOrganizationIds(scope) } },
        {
          operatorOrganizationId: { in: this.operatorOrganizationIds(scope) },
          status: { not: 'DRAFT' },
        },
      ],
    };
  }
  orderWhere(scope: ActorScope): Prisma.CommercialOrderWhereInput {
    return {
      rfq: {
        OR: [
          { buyerOrganizationId: { in: this.buyerOrganizationIds(scope) } },
          { operatorOrganizationId: { in: this.operatorOrganizationIds(scope) } },
        ],
      },
    };
  }
  offerWhere(scope: ActorScope): Prisma.CommercialOfferWhereInput {
    return {
      OR: [
        { artisanProfileId: scope.ownArtisanProfileId ?? NONE },
        { order: { rfq: { operatorOrganizationId: { in: this.operatorOrganizationIds(scope) } } } },
      ],
    };
  }
  batchWhere(scope: ActorScope): Prisma.CommercialBatchWhereInput {
    return {
      OR: [
        { artisanProfileId: scope.ownArtisanProfileId ?? NONE },
        { order: { rfq: { operatorOrganizationId: { in: this.operatorOrganizationIds(scope) } } } },
      ],
    };
  }
  paymentWhere(scope: ActorScope): Prisma.SyntheticPaymentWhereInput {
    return {
      OR: [
        {
          order: {
            rfq: {
              operatorOrganizationId: {
                in: this.operatorOrganizationIds(scope, 'FINANCE_MANAGER'),
              },
            },
          },
        },
        {
          kind: 'BUYER_RECEIPT',
          order: { rfq: { buyerOrganizationId: { in: this.buyerOrganizationIds(scope) } } },
        },
        { kind: 'ARTISAN_PAYOUT', batch: { artisanProfileId: scope.ownArtisanProfileId ?? NONE } },
      ],
    };
  }
  artisanProfileWhere(scope: ActorScope): Prisma.ArtisanProfileWhereInput {
    return { id: scope.ownArtisanProfileId ?? NONE };
  }
  // Documents are issued to buyers; the invoice permission controls the list.
  documentWhere(scope: ActorScope): Prisma.ProcurementDocumentWhereInput {
    const ids = scope.memberships
      .filter((m) => m.type === 'BUYER_BUSINESS' && m.permissions.includes('buyer.invoice.read'))
      .map((m) => m.organizationId);
    return { rfq: { buyerOrganizationId: { in: ids } } };
  }

  // ---- Commerce loaders: 404 outside the perimeter, capacities for in-perimeter checks ----
  async rfq(actor: Actor, id: string, tx: Db) {
    const scope = await this.scope(actor, tx);
    const row = await tx.commercialRfq.findFirst({
      where: { AND: [{ id }, this.rfqWhere(scope)] },
    });
    if (!row) outOfPerimeter();
    return { row, scope, capacities: this.rfqCapacities(scope, row) };
  }
  async order(actor: Actor, id: string, tx: Db) {
    const scope = await this.scope(actor, tx);
    const row = await tx.commercialOrder.findFirst({
      where: { AND: [{ id }, this.orderWhere(scope)] },
      include: orderInclude,
    });
    if (!row) outOfPerimeter();
    return { row, scope, capacities: this.rfqCapacities(scope, row.rfq) };
  }
  private async orderOf(tx: Db, id: string): Promise<OrderRecord> {
    const order = await tx.commercialOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) outOfPerimeter();
    return order;
  }
  async offer(actor: Actor, id: string, tx: Db) {
    const scope = await this.scope(actor, tx);
    const row = await tx.commercialOffer.findFirst({
      where: { AND: [{ id }, this.offerWhere(scope)] },
    });
    if (!row) outOfPerimeter();
    const order = await this.orderOf(tx, row.orderId);
    return {
      row,
      order,
      scope,
      capacities: [
        ...this.rfqCapacities(scope, order.rfq),
        ...this.artisanCapacity(scope, row.artisanProfileId, 'artisan.offer.decide'),
      ],
    };
  }
  async batch(actor: Actor, id: string, tx: Db) {
    const scope = await this.scope(actor, tx);
    const row = await tx.commercialBatch.findFirst({
      where: { AND: [{ id }, this.batchWhere(scope)] },
      include: { offer: true },
    });
    if (!row) outOfPerimeter();
    const order = await this.orderOf(tx, row.orderId);
    return {
      row,
      order,
      scope,
      capacities: [
        ...this.rfqCapacities(scope, order.rfq),
        ...this.artisanCapacity(scope, row.artisanProfileId, 'artisan.batch.report'),
      ],
    };
  }
  async payment(actor: Actor, id: string, tx: Db) {
    const scope = await this.scope(actor, tx);
    const row = await tx.syntheticPayment.findFirst({
      where: { AND: [{ id }, this.paymentWhere(scope)] },
    });
    if (!row) outOfPerimeter();
    const order = await this.orderOf(tx, row.orderId);
    return { row, order, scope, capacities: this.rfqCapacities(scope, order.rfq) };
  }

  // ---- Procurement: RFQ access, documents and attachments ----
  async procurementAccess(
    tx: Db,
    actor: Actor,
    rfq: CommercialRfq,
    thread = false,
  ): Promise<ProcurementAccess> {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const buyer = members.find(
      (m) =>
        m.organizationId === rfq.buyerOrganizationId &&
        m.organization.type === 'BUYER_BUSINESS' &&
        permissionsForMembership(m).includes('buyer.rfq.read'),
    );
    const internal = members.find(
      (m) =>
        m.organizationId === rfq.operatorOrganizationId &&
        m.organization.type === 'INTERNAL' &&
        (permissionsForMembership(m).includes('finance.payment.manage') ||
          permissionsForMembership(m).includes('operator.quotation.prepare')),
    );
    const finance = Boolean(
      internal && permissionsForMembership(internal).includes('finance.payment.manage'),
    );
    const assigned =
      finance ||
      Boolean(
        internal &&
          (await tx.operatorAssignment.findFirst({
            where: {
              operatorId: actor.id,
              organizationId: rfq.buyerOrganizationId,
              revokedAt: null,
              organization: { approvalStatus: 'APPROVED' },
            },
          })),
      );
    const buyerAvailable = await tx.organization.findFirst({
      where: { id: rfq.buyerOrganizationId, approvalStatus: 'APPROVED' },
      select: { id: true },
    });
    const operator = Boolean(internal && assigned && buyerAvailable && rfq.status !== 'DRAFT');
    const partnerScopeAvailable = Boolean(
      await tx.commercialRfq.findFirst({
        where: {
          id: rfq.id,
          buyerOrganization: { approvalStatus: 'APPROVED' },
          operatorOrganization: { approvalStatus: 'APPROVED' },
        },
        select: { id: true },
      }),
    );
    let coordinator = false;
    if (thread && !buyer && !operator && partnerScopeAvailable) {
      const member = members.find(
        (m) =>
          m.isCoordinator && ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(m.organization.type),
      );
      coordinator = Boolean(
        member &&
          (await tx.commercialOffer.findFirst({
            where: {
              order: { rfqId: rfq.id },
              status: 'ACCEPTED',
              artisanProfile: {
                authorizations: {
                  some: { purpose: 'PARTICIPATION', withdrawnAt: null, policy: { active: true } },
                },
                assignments: {
                  some: {
                    coordinatorId: actor.id,
                    organizationId: member.organizationId,
                    endedAt: null,
                  },
                },
                managements: { some: { organizationId: member.organizationId, endedAt: null } },
              },
            },
          })),
      );
    }
    if (!buyer && !operator && !coordinator) outOfPerimeter();
    const perms = buyer ? permissionsForMembership(buyer) : [];
    return {
      buyer: Boolean(buyer),
      operator,
      purchasing: perms.includes('buyer.rfq.create'),
      negotiating: perms.includes('buyer.quotation.negotiate'),
      approving: perms.includes('buyer.quotation.approve'),
      coordinator,
    };
  }
  async procurementRfq(tx: Db, actor: Actor, id: string, thread = false) {
    const row = await tx.commercialRfq.findUnique({ where: { id } });
    if (!row) outOfPerimeter();
    return { row, access: await this.procurementAccess(tx, actor, row, thread) };
  }
  async document(tx: Db, actor: Actor, id: string) {
    const doc = await tx.procurementDocument.findUnique({ where: { id } });
    if (!doc) outOfPerimeter();
    await this.procurementRfq(tx, actor, doc.rfqId);
    return doc;
  }
  async attachment(tx: Db, actor: Actor, rfqId: string, fileId: string) {
    await this.procurementRfq(tx, actor, rfqId);
    const file = await tx.procurementAttachment.findFirst({
      where: { id: fileId, rfqId, removedAt: null },
    });
    if (!file) outOfPerimeter();
    return file;
  }

  // ---- Artisan profile: owner, or an active delegation with the requested scope ----
  async artisanProfile(
    actor: Actor,
    id: string,
    scope: DelegationScope,
    db: Db = this.db,
    grantId?: string,
  ) {
    const profile = await db.artisanProfile.findUnique({ where: { id }, select: profileSelect });
    if (!profile) outOfPerimeter();
    // Assisted-registry profiles (no linked account) and unavailable owners look exactly like a
    // profile that does not exist, for everyone, owner included.
    if (!profile.userId) outOfPerimeter();
    const owner = await db.user.findUnique({
      where: { id: profile.userId },
      select: { status: true, emailVerified: true },
    });
    if (owner?.status !== 'ACTIVE' || !owner.emailVerified) outOfPerimeter();
    if (profile.userId === actor.id) return { profile, delegation: null };
    // A delegation only reaches profiles the owner created and still consents to share.
    if (profile.createdById && profile.createdById !== profile.userId) outOfPerimeter();
    const consent = await db.consentRecord.findFirst({
      where: {
        userId: profile.userId,
        purpose: 'artisan.profile',
        decision: true,
        withdrawnAt: null,
      },
    });
    if (!consent) outOfPerimeter();
    const grants = await db.delegationGrant.findMany({
      where: {
        id: grantId,
        artisanProfileId: id,
        delegateUserId: actor.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
        scopes: { has: scopeMap[scope] },
      },
    });
    for (const grant of grants) {
      const relationship = await db.associationMembership.findFirst({
        where: {
          artisanProfileId: id,
          organizationId: grant.organizationId,
          status: 'ACTIVE',
          endedAt: null,
          consentRecord: { decision: true, withdrawnAt: null },
          organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        },
      });
      const membership = await db.organizationMember.findFirst({
        where: {
          organizationId: grant.organizationId,
          userId: actor.id,
          status: 'ACTIVE',
          roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
        },
      });
      const delegationConsent = await db.consentRecord.findFirst({
        where: {
          userId: profile.userId,
          purpose: `delegation:${grant.id}`,
          decision: true,
          withdrawnAt: null,
        },
      });
      if (relationship && membership && delegationConsent) return { profile, delegation: grant };
    }
    return outOfPerimeter();
  }
}