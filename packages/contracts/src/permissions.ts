export const businessRoles = [
  'BUYER',
  'ARTISAN',
  'ASSOCIATION_COORDINATOR',
  'PRODUCTION_MANAGER',
  'FINANCE_MANAGER',
  'QUALITY_INSPECTOR',
  'INVENTORY_LOGISTICS_COORDINATOR',
  'SUPPORT',
  'RESEARCHER_ANALYST',
  'PRODUCT_DESIGNER',
  'BUSINESS_DEVELOPMENT',
] as const;
export type BusinessRole = (typeof businessRoles)[number];
export const permissionCatalog = [
  'organization.create',
  'organization.read',
  'organization.update',
  'organization.approval.request',
  'organization.approval.review',
  'organization.members.read',
  'organization.members.invite',
  'organization.members.update',
  'organization.members.remove',
  'organization.roles.assign',
  'organization.roles.revoke',
  'artisan.profile.read',
  'artisan.profile.update',
  'artisan.skills.manage',
  'artisan.capacity.read',
  'artisan.capacity.update',
  'artisan.associations.manage',
  'delegation.create',
  'delegation.read',
  'delegation.revoke',
  'finance.quotation.read',
  'finance.payout.read',
  'finance.payout.approve',
  'quality.inspection.read',
  'quality.inspection.create',
  'support.case.read',
  'support.case.manage',
  'privacy.request.create',
  'privacy.request.review',
  'audit.read',
  'production.manage',
  'inventory.manage',
  'analytics.aggregate.read',
  'product.specification.manage',
  'buyer.relationship.manage',
] as const;
export type Permission = (typeof permissionCatalog)[number];
const orgManagement: Permission[] = [
  'organization.read',
  'organization.update',
  'organization.approval.request',
  'organization.members.read',
  'organization.members.invite',
  'organization.members.update',
  'organization.members.remove',
  'organization.roles.assign',
  'organization.roles.revoke',
  'audit.read',
];
export const rolePermissions: Record<BusinessRole, readonly Permission[]> = {
  BUYER: ['organization.read', 'finance.quotation.read'],
  ARTISAN: ['organization.read'],
  ASSOCIATION_COORDINATOR: ['organization.read'],
  PRODUCTION_MANAGER: ['organization.read', 'production.manage'],
  FINANCE_MANAGER: [
    'organization.read',
    'finance.quotation.read',
    'finance.payout.read',
    'finance.payout.approve',
  ],
  QUALITY_INSPECTOR: ['organization.read', 'quality.inspection.read', 'quality.inspection.create'],
  INVENTORY_LOGISTICS_COORDINATOR: ['organization.read', 'inventory.manage'],
  SUPPORT: ['organization.read', 'support.case.read', 'support.case.manage'],
  RESEARCHER_ANALYST: ['organization.read', 'analytics.aggregate.read'],
  PRODUCT_DESIGNER: ['organization.read', 'product.specification.manage'],
  BUSINESS_DEVELOPMENT: ['organization.read', 'buyer.relationship.manage'],
};
export function rolesForOrganization(type: string): BusinessRole[] {
  if (type === 'BUYER_BUSINESS') return ['BUYER'];
  if (type === 'ASSOCIATION') return ['ASSOCIATION_COORDINATOR', 'ARTISAN', 'SUPPORT'];
  if (type === 'INTERNAL') return [...businessRoles].filter((r) => r !== 'BUYER');
  return [];
}
export function permissionsForMembership(member: {
  isManager: boolean;
  roles: { role: BusinessRole }[];
  status: string;
  organization?: { approvalStatus: string };
}): Permission[] {
  if (member.status !== 'ACTIVE') return [];
  const permissions = new Set<Permission>(['organization.read']);
  for (const role of member.roles)
    for (const permission of rolePermissions[role.role]) permissions.add(permission);
  if (member.isManager) for (const permission of orgManagement) permissions.add(permission);
  if (member.organization && member.organization.approvalStatus !== 'APPROVED') {
    const governance: Permission[] = [
      'organization.read',
      'organization.update',
      'organization.approval.request',
      'organization.members.read',
    ];
    return [...permissions].filter((p) => governance.includes(p));
  }
  return [...permissions];
}
