// Single source of truth for signed-in navigation. Add a route here, not in the layout.
export type NavIcon =
  | 'organization'
  | 'artisan'
  | 'support'
  | 'approval'
  | 'users'
  | 'audit'
  | 'privacy';
export type NavItem = { href: string; label: string; icon: NavIcon; match?: string };
export type NavSection = { label: string; items: NavItem[]; adminOnly?: boolean };

export type WorkspaceCapabilities = {
  buyer: boolean;
  artisan: boolean;
  operator: boolean;
  admin: boolean;
};
export type WorkspaceAction = NavItem & { description: string };
export const dashboardActions: Record<
  'admin' | 'buyer' | 'association' | 'operator',
  WorkspaceAction[]
> = {
  admin: [
    {
      href: '/admin/retention',
      label: 'Retention and purpose',
      icon: 'privacy',
      description: 'Review dataset purpose, preservation and pending retention policy.',
    },
    {
      href: '/admin/users',
      label: 'User accounts',
      icon: 'users',
      description: 'Find people, manage account access and revoke sessions.',
    },
    {
      href: '/admin/organizations',
      label: 'Organization approvals',
      icon: 'approval',
      description: 'Review buyer businesses, associations and approval requests.',
    },
    {
      href: '/admin/coordinators',
      label: 'Coordinator access',
      icon: 'artisan',
      description: 'Invite coordinators and manage their association affiliations.',
    },
    {
      href: '/admin/operators',
      label: 'Internal personnel',
      icon: 'organization',
      description: 'Invite NASJ operators and assign buyer and partner accounts.',
    },
    {
      href: '/admin/participant-concerns',
      label: 'Participant concerns',
      icon: 'support',
      description: 'Review concerns independently of association operations.',
    },
    {
      href: '/admin/demo-feedback',
      label: 'Showroom feedback',
      icon: 'support',
      description: 'Triage structured feedback visitors left about the synthetic demonstration.',
    },
    {
      href: '/admin/privacy-requests',
      label: 'Privacy requests',
      icon: 'privacy',
      description: 'Review correction, export and deletion requests.',
    },
    {
      href: '/admin/authorizations',
      label: 'Authorization policies',
      icon: 'approval',
      description: 'Record reviewed participation and evidence policies.',
    },
    {
      href: '/admin/access',
      label: 'Access diagnostics',
      icon: 'users',
      description: 'Check effective roles, permissions and affiliations.',
    },
    {
      href: '/admin/audit',
      label: 'Audit history',
      icon: 'audit',
      description: 'Inspect attributable platform governance actions.',
    },
  ],
  buyer: [
    {
      href: '/procurement',
      label: 'Procurement requests',
      icon: 'organization',
      description: 'Prepare a request, answer questions and follow your company’s orders.',
    },
    {
      href: '/commerce/catalog',
      label: 'Craft catalog',
      icon: 'artisan',
      description: 'Explore craft categories and example products for your next request.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Search privacy-safe declared capacity by craft, region and period.',
    },
    {
      href: '/procurement/documents',
      label: 'Procurement documents',
      icon: 'audit',
      description: 'Find your company’s quote, contract and delivery records.',
    },
    {
      href: '/procurement/products',
      label: 'Approved products',
      icon: 'approval',
      description: 'Start a fresh request from a previously approved product.',
    },
    {
      href: '/buyer/company',
      label: 'Company profile and representatives',
      icon: 'users',
      description: 'Manage your company and independently authorized purchasing access.',
    },
    {
      href: '/catalog',
      label: 'Product design and sampling',
      icon: 'organization',
      description: 'Review specification versions and approve or reject production samples.',
    },
  ],
  association: [
    {
      href: '/association/materials',
      label: 'Materials and receipts',
      icon: 'artisan',
      description: 'Review assigned materials and report receipt discrepancies.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Review your group capacity and search other declared production periods.',
    },
    {
      href: '/association/pickups',
      label: 'Assigned pickups',
      icon: 'artisan',
      description: 'See collection windows and record handover for your association.',
    },
    {
      href: '/association/production',
      label: 'Assigned production work',
      icon: 'artisan',
      description: 'Record progress for assigned artisans without accepting work for them.',
    },
    {
      href: '/association/offers',
      label: 'Assigned production offers',
      icon: 'artisan',
      description: 'Explain issued work and record a reported decision for an assigned artisan.',
    },
    {
      href: '/association/artisans',
      label: 'Assigned artisan registry',
      icon: 'artisan',
      description: 'View your assigned artisans, profiles and declared capacity.',
    },
    {
      href: '/association/artisans/new',
      label: 'Add artisan',
      icon: 'users',
      description: 'Record a participant and their authorization without creating a login.',
    },
    {
      href: '/association/coordinators',
      label: 'Association coordinators',
      icon: 'organization',
      description: 'See the coordinators affiliated with your organization.',
    },
    {
      href: '/procurement/discussions',
      label: 'Order discussions',
      icon: 'support',
      description: 'Discuss accepted orders involving your assigned participants.',
    },
  ],
  operator: [
    {
      href: '/operator/sales',
      label: 'Commercial pipeline',
      icon: 'organization',
      description: 'Qualify prospects and preserve pilot proposal history.',
    },
    {
      href: '/operator/inventory',
      label: 'Materials inventory',
      icon: 'organization',
      description: 'Manage scoped material lots, reservations and custody.',
    },
    {
      href: '/operator/finance',
      label: 'Finance and closure',
      icon: 'audit',
      description: 'Review deposits, payout approvals, disputes and closure blockers.',
    },
    {
      href: '/procurement',
      label: 'Procurement requests',
      icon: 'organization',
      description: 'Review assigned buyer requests, clarify specifications and prepare quotations.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Search privacy-safe declared capacity by craft, region and period.',
    },
    {
      href: '/catalog',
      label: 'Product design and sampling',
      icon: 'organization',
      description: 'Versioned specifications, paid sample terms and buyer sample approval.',
    },
    {
      href: '/operator/planning',
      label: 'Production planning',
      icon: 'artisan',
      description:
        'Rank eligible groups, allocate an order across groups and compare delivery plans.',
    },
    {
      href: '/collaboration',
      label: 'Collaboration and support',
      icon: 'support',
      description: 'Exceptions, schedule changes, counteroffers, support cases and notifications.',
    },
    {
      href: '/intelligence',
      label: 'Production intelligence',
      icon: 'audit',
      description: 'Delay risk, forecast comparison, fairness review and business metrics.',
    },
    {
      href: '/operator/activity',
      label: 'Assigned account activity',
      icon: 'audit',
      description: 'Follow activity across your assigned buyers and partner organizations.',
    },
  ],
};
export function workspaceNavigation(
  context: import('@nasj/contracts').IdentityContext | null | undefined,
  legacy: WorkspaceCapabilities,
): NavSection[] {
  const personas = context?.personas ?? [];
  const sections: NavSection[] = [];
  const roles = [
    ['PLATFORM_ADMIN', 'Administration', 'admin', '/admin'],
    ['NASJ_OPERATOR', 'Coordination', 'operator', '/operator'],
    ['BUYER_REPRESENTATIVE', 'Purchasing', 'buyer', '/buyer'],
    ['ASSOCIATION_COORDINATOR', 'Association', 'association', '/association'],
  ] as const;
  for (const [persona, label, mode, home] of roles) {
    if (personas.includes(persona))
      sections.push({
        label,
        items: [
          { href: home, label: 'Dashboard', icon: 'organization' },
          ...dashboardActions[mode].filter(
            (a) => mode !== 'association' || a.href !== '/association/artisans/new',
          ),
        ],
      });
  }
  if (!personas.length)
    sections.push({
      label: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: 'organization' },
        { href: '/commerce/catalog', label: 'Craft catalog', icon: 'artisan' },
      ],
    });
  const historical: NavItem[] = [];
  if (legacy.artisan && context?.linkedArtisanProfileId)
    historical.push({ href: '/commerce/artisan', label: 'Offers & production', icon: 'artisan' });
  if (legacy.operator)
    historical.push({ href: '/commerce/operator', label: 'Operator review', icon: 'organization' });
  if (historical.length) sections.push({ label: 'Existing workflows', items: historical });
  sections.push({
    label: 'Account',
    items: [
      { href: '/settings/organizations', label: 'Organizations', icon: 'organization' },
      ...(context?.linkedArtisanProfileId
        ? [
            { href: '/artisan/profile', label: 'Your artisan profile', icon: 'artisan' as const },
            { href: '/artisan/materials', label: 'Your materials', icon: 'artisan' as const },
            { href: '/artisan/compensation', label: 'Your compensation', icon: 'audit' as const },
          ]
        : []),
      { href: '/settings/profile', label: 'Your account', icon: 'users' },
      { href: '/settings/security', label: 'Security', icon: 'privacy' },
      { href: '/support/cases', label: 'Support', icon: 'support' },
    ],
  });
  return sections;
}
export function workspaceRoleLabel(
  context: import('@nasj/contracts').IdentityContext | null | undefined,
) {
  const labels = {
    PLATFORM_ADMIN: 'Platform admin',
    NASJ_OPERATOR: 'NASJ operator',
    BUYER_REPRESENTATIVE: 'Buyer representative',
    ASSOCIATION_COORDINATOR: 'Association coordinator',
  };
  return context?.personas.map((p) => labels[p]).join(' · ') || 'Your account';
}

export const profileMenuItems = [
  { href: '/settings/profile', label: 'Account and email' },
  { href: '/settings/security', label: 'Security and two-factor' },
  { href: '/settings/notifications', label: 'Language and notifications' },
  { href: '/support/privacy', label: 'Privacy and your data' },
];

export function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true;
  // Admin and member organization pages share a segment; keep them in their own sections.
  if (!item.match) return false;
  if (item.match === '/organizations')
    return pathname.startsWith('/organizations/') || pathname === '/settings/organizations';
  return pathname.startsWith(item.match);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}
