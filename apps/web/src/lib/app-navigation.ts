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

export const sidebarSections: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      {
        href: '/settings/organizations',
        label: 'Organizations',
        icon: 'organization',
        match: '/organizations',
      },
      { href: '/artisan/profile', label: 'Artisan workspace', icon: 'artisan', match: '/artisan' },
      { href: '/support/cases', label: 'Support', icon: 'support', match: '/support' },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [
      {
        href: '/admin/organizations',
        label: 'Organizations',
        icon: 'organization',
        match: '/admin/organizations',
      },
      { href: '/admin/approvals', label: 'Approvals', icon: 'approval' },
      { href: '/admin/users', label: 'User accounts', icon: 'users' },
      { href: '/admin/audit', label: 'Audit history', icon: 'audit' },
      { href: '/admin/privacy-requests', label: 'Privacy requests', icon: 'privacy' },
    ],
  },
];

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
