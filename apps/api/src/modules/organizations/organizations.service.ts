import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  Prisma,
  type Organization,
  type OrganizationMember,
  type MembershipRole,
  type Invitation,
} from '@prisma/client';
import {
  rolesForOrganization,
  permissionsForMembership,
  type OrganizationCreateInput,
  type OrganizationUpdateInput,
  type InvitationCreateInput,
  type MembershipUpdateInput,
  type MembershipRolesInput,
  type PageInput,
  type OrganizationView,
  type MembershipView,
  type InvitationView,
} from '@hirfacare/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { MailService } from '../mail/mail.service.js';
import { PolicyService } from '../foundation/policy.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenValue = () => randomBytes(32).toString('hex');
const invitationExpiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
type MemberWithRoles = OrganizationMember & { roles: MembershipRole[] };
function organizationView(org: Organization): OrganizationView {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    type: org.type,
    approvalStatus: org.approvalStatus,
    country: org.country,
    region: org.region,
    description: org.description,
    contactEmail: org.contactEmail,
    contactPhone: org.contactPhone,
    representativeName: org.representativeName,
    createdByUserId: org.createdByUserId,
    approvedByUserId: org.approvedByUserId,
    approvedAt: org.approvedAt?.toISOString() ?? null,
    approvalReason: org.approvalReason,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}
function membershipView(member: MemberWithRoles): MembershipView {
  return {
    id: member.id,
    userId: member.userId,
    organizationId: member.organizationId,
    status: member.status,
    isManager: member.isManager,
    roles: member.roles.map((role) => role.role),
    joinedAt: member.joinedAt.toISOString(),
  };
}
function invitationView(invitation: Invitation): InvitationView {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    roles: invitation.roles,
    isManager: invitation.isManager,
    status:
      invitation.status === 'PENDING' && invitation.expiresAt <= new Date()
        ? 'EXPIRED'
        : invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}
const pagination = (input: PageInput) => ({
  skip: (input.page - 1) * input.pageSize,
  take: input.pageSize,
});

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(actor: Actor, input: OrganizationCreateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      if (input.type === 'INTERNAL') await this.policy.requireAdmin(actor, tx);
      const initialRoles =
        input.type === 'BUYER_BUSINESS'
          ? ['BUYER' as const]
          : input.type === 'ASSOCIATION'
            ? ['ASSOCIATION_COORDINATOR' as const]
            : [];
      const baseSlug =
        input.name
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 70) || 'organization';
      const organization = await tx.organization.create({
        data: {
          name: input.name,
          type: input.type,
          country: input.country,
          region: input.region,
          description: input.description,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone || null,
          representativeName: input.representativeName,
          slug: `${baseSlug}-${randomBytes(6).toString('hex')}`,
          createdByUserId: actor.id,
        },
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: actor.id,
          isManager: true,
          roles: { create: initialRoles.map((role) => ({ role, assignedByUserId: actor.id })) },
        },
        include: { roles: true },
      });
      await audit(tx, actor, {
        action: 'organization.create',
        targetType: 'Organization',
        targetId: organization.id,
        organizationId: organization.id,
        after: { type: organization.type },
      });
      return { ...organizationView(organization), myMembership: membershipView(member) };
    });
  }

  async list(actor: Actor, input: PageInput) {
    const where: Prisma.OrganizationMemberWhereInput = {
      userId: actor.id,
      ...(input.q ? { organization: { name: { contains: input.q, mode: 'insensitive' } } } : {}),
    };
    const [members, total] = await this.db.$transaction([
      this.db.organizationMember.findMany({
        where,
        ...pagination(input),
        include: { roles: true, organization: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.organizationMember.count({ where }),
    ]);
    return {
      items: members.map((member) => ({
        id: member.organization.id,
        name: member.organization.name,
        slug: member.organization.slug,
        type: member.organization.type,
        approvalStatus: member.organization.approvalStatus,
        myMembership: membershipView(member),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async detail(actor: Actor, id: string) {
    const member = await this.policy.requireOrganization(actor, id, 'organization.read');
    return {
      ...organizationView(member.organization),
      myMembership: membershipView(member),
      permissions: permissionsForMembership(member),
      assignableRoles: member.isManager ? rolesForOrganization(member.organization.type) : [],
    };
  }

  async update(actor: Actor, id: string, input: OrganizationUpdateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.policy.requireOrganization(actor, id, 'organization.update', tx);
      if (!['DRAFT', 'REJECTED'].includes(member.organization.approvalStatus))
        fail(
          409,
          'ORGANIZATION_REVIEW_REQUIRED',
          'Only draft or rejected organization profiles may be edited.',
        );
      const organization = await tx.organization.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
          ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone || null } : {}),
          ...(input.representativeName !== undefined
            ? { representativeName: input.representativeName }
            : {}),
        },
      });
      await audit(tx, actor, {
        action: 'organization.update',
        targetType: 'Organization',
        targetId: id,
        organizationId: id,
        after: { fields: Object.keys(input) },
      });
      return organizationView(organization);
    });
  }

  async submitApproval(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.policy.requireOrganization(
        actor,
        id,
        'organization.approval.request',
        tx,
      );
      if (!['DRAFT', 'REJECTED'].includes(member.organization.approvalStatus))
        fail(
          409,
          'INVALID_TRANSITION',
          'Only draft or rejected organizations can request approval.',
        );
      const org = await tx.organization.update({
        where: { id },
        data: {
          approvalStatus: 'PENDING_REVIEW',
          approvedByUserId: null,
          approvedAt: null,
          approvalReason: null,
        },
      });
      await audit(tx, actor, {
        action: 'organization.approval.request',
        targetType: 'Organization',
        targetId: id,
        organizationId: id,
      });
      return organizationView(org);
    });
  }

  async adminList(actor: Actor, input: PageInput, pendingOnly = false) {
    await this.policy.requireAdmin(actor);
    const where: Prisma.OrganizationWhereInput = {
      ...(pendingOnly ? { approvalStatus: 'PENDING_REVIEW' } : {}),
      ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.organization.findMany({
        where,
        ...pagination(input),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.organization.count({ where }),
    ]);
    return {
      items: items.map(organizationView),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async adminDetail(actor: Actor, id: string) {
    await this.policy.requireAdmin(actor);
    const org = await this.db.organization.findUnique({ where: { id } });
    if (!org) fail(404, 'NOT_FOUND', 'Organization not found.');
    return organizationView(org);
  }

  async review(
    actor: Actor,
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
    reason: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const org = await tx.organization.findUnique({ where: { id } });
      if (!org) fail(404, 'NOT_FOUND', 'Organization not found.');
      if (
        status === 'SUSPENDED'
          ? org.approvalStatus !== 'APPROVED'
          : !['PENDING_REVIEW', 'SUSPENDED'].includes(org.approvalStatus)
      )
        fail(
          409,
          'INVALID_TRANSITION',
          'This organization cannot receive that approval decision in its current state.',
        );
      const result = await tx.organization.update({
        where: { id },
        data: {
          approvalStatus: status,
          approvedByUserId: actor.id,
          approvedAt: new Date(),
          approvalReason: reason,
        },
      });
      await audit(tx, actor, {
        action: `organization.${status.toLowerCase()}`,
        targetType: 'Organization',
        targetId: id,
        organizationId: id,
        reason,
        before: { approvalStatus: org.approvalStatus },
        after: { approvalStatus: status },
      });
      return organizationView(result);
    });
  }

  async members(actor: Actor, id: string, input: PageInput) {
    await this.policy.requireOrganization(actor, id, 'organization.members.read');
    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId: id,
      ...(input.q ? { user: { name: { contains: input.q, mode: 'insensitive' } } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.organizationMember.findMany({
        where,
        ...pagination(input),
        include: {
          roles: true,
          user: { select: { id: true, name: true, email: true, status: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.organizationMember.count({ where }),
    ]);
    return {
      items: items.map((member) => ({ ...membershipView(member), user: member.user })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  private validateRoles(type: Organization['type'], roles: InvitationCreateInput['roles']) {
    const allowed = rolesForOrganization(type);
    if (roles.some((role) => !allowed.includes(role)))
      fail(
        403,
        'ROLE_NOT_ALLOWED',
        'The requested roles are not allowed in this organization type.',
      );
  }

  private sendInvitation(invitation: Invitation, token: string, organizationName: string) {
    const url = new URL('/invitations/accept', this.config.PUBLIC_APP_URL);
    url.hash = `token=${token}`;
    this.mail.send(
      invitation.email,
      'HirfaCare organization invitation',
      `You have been invited to join ${organizationName} on HirfaCare. Sign in with this email address and accept the invitation:\n${url.toString()}\nThis invitation expires on ${invitation.expiresAt.toISOString()}.`,
    );
    return { invitation: invitationView(invitation), delivery: 'QUEUED' as const };
  }

  async invite(actor: Actor, id: string, input: InvitationCreateInput) {
    const token = tokenValue();
    const result = await iamTransaction(this.db, actor, async (tx) => {
      const member = await this.policy.requireOrganization(
        actor,
        id,
        'organization.members.invite',
        tx,
      );
      this.validateRoles(member.organization.type, input.roles);
      if (input.isManager && !member.isManager)
        fail(403, 'FORBIDDEN', 'Only organization managers may delegate manager access.');
      const existingMember = await tx.organizationMember.findFirst({
        where: { organizationId: id, user: { email: input.email } },
      });
      if (existingMember)
        fail(
          409,
          'MEMBERSHIP_EXISTS',
          'This person already has a membership; manage the existing membership.',
        );
      if (
        await tx.invitation.findFirst({
          where: {
            organizationId: id,
            email: input.email,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
        })
      )
        fail(409, 'INVITATION_EXISTS', 'A pending invitation already exists for this address.');
      const invitation = await tx.invitation.create({
        data: {
          organizationId: id,
          email: input.email,
          roles: input.roles,
          isManager: input.isManager,
          tokenHash: hashToken(token),
          expiresAt: invitationExpiry(),
          createdByUserId: actor.id,
        },
      });
      await audit(tx, actor, {
        action: 'organization.members.invite',
        targetType: 'Invitation',
        targetId: invitation.id,
        organizationId: id,
        after: { roles: input.roles, isManager: input.isManager },
      });
      return { invitation, organizationName: member.organization.name };
    });
    return this.sendInvitation(result.invitation, token, result.organizationName);
  }

  async invitations(actor: Actor, id: string, input: PageInput) {
    await this.policy.requireOrganization(actor, id, 'organization.members.invite');
    const where: Prisma.InvitationWhereInput = {
      organizationId: id,
      ...(input.q ? { email: { contains: input.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.invitation.findMany({
        where,
        ...pagination(input),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.invitation.count({ where }),
    ]);
    return { items: items.map(invitationView), total, page: input.page, pageSize: input.pageSize };
  }

  async cancelInvitation(actor: Actor, id: string, invitationId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireOrganization(actor, id, 'organization.members.invite', tx);
      const invitation = await tx.invitation.findFirst({
        where: { id: invitationId, organizationId: id },
      });
      if (!invitation) fail(404, 'NOT_FOUND', 'Invitation not found.');
      if (invitation.status !== 'PENDING')
        fail(409, 'INVALID_TRANSITION', 'Only pending invitations can be cancelled.');
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'CANCELLED' },
      });
      await audit(tx, actor, {
        action: 'invitation.cancel',
        targetType: 'Invitation',
        targetId: invitationId,
        organizationId: id,
      });
      return invitationView(updated);
    });
  }

  async resendInvitation(actor: Actor, id: string, invitationId: string) {
    const token = tokenValue();
    const result = await iamTransaction(this.db, actor, async (tx) => {
      const member = await this.policy.requireOrganization(
        actor,
        id,
        'organization.members.invite',
        tx,
      );
      const invitation = await tx.invitation.findFirst({
        where: { id: invitationId, organizationId: id },
      });
      if (!invitation) fail(404, 'NOT_FOUND', 'Invitation not found.');
      if (invitation.status !== 'PENDING')
        fail(409, 'INVALID_TRANSITION', 'Only pending invitations can be resent.');
      this.validateRoles(member.organization.type, invitation.roles);
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          tokenHash: hashToken(token),
          expiresAt: invitationExpiry(),
          createdByUserId: actor.id,
        },
      });
      await audit(tx, actor, {
        action: 'invitation.resend',
        targetType: 'Invitation',
        targetId: invitationId,
        organizationId: id,
      });
      return { invitation: updated, organizationName: member.organization.name };
    });
    return this.sendInvitation(result.invitation, token, result.organizationName);
  }

  async acceptInvitation(actor: Actor, token: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { organization: true, createdBy: true },
      });
      if (invitation?.status !== 'PENDING' || invitation.expiresAt <= new Date())
        fail(400, 'INVALID_INVITATION', 'This invitation is invalid, expired or already used.');
      const recipient = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      if (recipient.email.toLowerCase() !== invitation.email.toLowerCase())
        fail(403, 'INVITATION_EMAIL_MISMATCH', 'Sign in with the invited email address.');
      if (invitation.createdBy.status !== 'ACTIVE' || !invitation.createdBy.emailVerified)
        fail(403, 'INVITER_UNAVAILABLE', 'The inviter no longer has permission to add members.');
      const inviter = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: invitation.createdByUserId,
          },
        },
        include: { roles: true, organization: true },
      });
      if (
        inviter?.status !== 'ACTIVE' ||
        !inviter.isManager ||
        invitation.organization.approvalStatus !== 'APPROVED'
      )
        fail(
          403,
          'INVITER_UNAVAILABLE',
          'The inviter or organization no longer permits invitation acceptance.',
        );
      this.validateRoles(invitation.organization.type, invitation.roles);
      if (
        await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId: invitation.organizationId, userId: actor.id },
          },
        })
      )
        fail(
          409,
          'MEMBERSHIP_EXISTS',
          'Your membership already exists; contact an organization manager.',
        );
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (claimed.count !== 1)
        fail(409, 'INVITATION_USED', 'This invitation has already been used.');
      const member = await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: actor.id,
          isManager: invitation.isManager,
          roles: {
            create: invitation.roles.map((role) => ({
              role,
              assignedByUserId: invitation.createdByUserId,
            })),
          },
        },
        include: { roles: true },
      });
      await audit(tx, actor, {
        action: 'invitation.accept',
        targetType: 'OrganizationMember',
        targetId: member.id,
        organizationId: invitation.organizationId,
        after: { roles: invitation.roles, isManager: invitation.isManager },
      });
      return { ...organizationView(invitation.organization), myMembership: membershipView(member) };
    });
  }

  private async protectManager(
    tx: Db,
    member: MemberWithRoles,
    next: { status?: string; isManager?: boolean },
  ) {
    if (
      !member.isManager ||
      member.status !== 'ACTIVE' ||
      ((next.status ?? member.status) === 'ACTIVE' && (next.isManager ?? member.isManager))
    )
      return;
    const remaining = await tx.organizationMember.count({
      where: {
        organizationId: member.organizationId,
        id: { not: member.id },
        status: 'ACTIVE',
        isManager: true,
        user: { status: 'ACTIVE', emailVerified: true },
      },
    });
    if (!remaining)
      fail(
        409,
        'LAST_ORGANIZATION_MANAGER',
        'Keep at least one active verified organization manager.',
      );
  }

  async updateMember(actor: Actor, id: string, memberId: string, input: MembershipUpdateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireOrganization(actor, id, 'organization.members.update', tx);
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: id },
        include: { roles: true, user: true },
      });
      if (!member) fail(404, 'NOT_FOUND', 'Membership not found.');
      if (member.userId === actor.id && input.isManager !== undefined)
        fail(
          403,
          'SELF_PROMOTION_DENIED',
          'Ask another organization manager to change your manager access.',
        );
      if (
        (input.status ?? member.status) === 'ACTIVE' &&
        (member.user.status !== 'ACTIVE' || !member.user.emailVerified)
      )
        fail(
          409,
          'ACCOUNT_UNAVAILABLE',
          'Only active verified accounts may have active memberships.',
        );
      await this.protectManager(tx, member, input);
      const next = await tx.organizationMember.update({
        where: { id: member.id },
        data: {
          ...(input.status !== undefined
            ? {
                status: input.status,
                suspendedAt: input.status === 'SUSPENDED' ? new Date() : null,
                revokedAt: ['REVOKED', 'LEFT'].includes(input.status) ? new Date() : null,
              }
            : {}),
          ...(input.isManager !== undefined ? { isManager: input.isManager } : {}),
        },
        include: { roles: true },
      });
      await audit(tx, actor, {
        action: 'organization.members.update',
        targetType: 'OrganizationMember',
        targetId: member.id,
        organizationId: id,
        reason: input.reason,
        before: { status: member.status, isManager: member.isManager },
        after: { status: next.status, isManager: next.isManager },
      });
      return membershipView(next);
    });
  }

  async setRoles(actor: Actor, id: string, memberId: string, input: MembershipRolesInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const manager = await this.policy.requireOrganization(
        actor,
        id,
        'organization.roles.assign',
        tx,
      );
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: id },
        include: { roles: true },
      });
      if (!member) fail(404, 'NOT_FOUND', 'Membership not found.');
      if (member.userId === actor.id)
        fail(403, 'SELF_PROMOTION_DENIED', 'Another organization manager must change your roles.');
      this.validateRoles(manager.organization.type, input.roles);
      await tx.membershipRole.deleteMany({ where: { membershipId: member.id } });
      await tx.membershipRole.createMany({
        data: input.roles.map((role) => ({
          membershipId: member.id,
          role,
          assignedByUserId: actor.id,
        })),
      });
      await audit(tx, actor, {
        action: 'organization.roles.assign',
        targetType: 'OrganizationMember',
        targetId: member.id,
        organizationId: id,
        reason: input.reason,
        before: { roles: member.roles.map((role) => role.role) },
        after: { roles: input.roles },
      });
      return membershipView(
        await tx.organizationMember.findUniqueOrThrow({
          where: { id: member.id },
          include: { roles: true },
        }),
      );
    });
  }

  async removeMember(actor: Actor, id: string, memberId: string, reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: id },
        include: { roles: true },
      });
      if (!member) fail(404, 'NOT_FOUND', 'Membership not found.');
      const self = member.userId === actor.id;
      if (self) {
        if (member.status !== 'ACTIVE')
          fail(403, 'MEMBERSHIP_UNAVAILABLE', 'This membership is no longer active.');
      } else await this.policy.requireOrganization(actor, id, 'organization.members.remove', tx);
      await this.protectManager(tx, member, { status: self ? 'LEFT' : 'REVOKED' });
      const next = await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: self ? 'LEFT' : 'REVOKED', revokedAt: new Date() },
        include: { roles: true },
      });
      await audit(tx, actor, {
        action: self ? 'organization.members.leave' : 'organization.members.remove',
        targetType: 'OrganizationMember',
        targetId: member.id,
        organizationId: id,
        reason,
        before: { status: member.status },
        after: { status: next.status },
      });
      return membershipView(next);
    });
  }
}
