'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import type { IdentityContext } from '@nasj/contracts';
import { initials, profileMenuItems } from '@/lib/app-navigation';
import { Wordmark, SiteFooter } from './brand';
import { Icon } from './icons';
import { LogoutButton } from './logout-button';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Badge } from './ui/badge';
type Capabilities = { buyer: boolean; artisan: boolean; operator: boolean; admin: boolean };
export function AppShell({
  name,
  email,
  capabilities,
  children,
  demo = false,
  context,
}: {
  name: string;
  email: string;
  capabilities: Capabilities;
  children: ReactNode;
  demo?: boolean;
  context?: IdentityContext | null;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false);
  const work = [
    {
      href: context?.landingPath ?? '/dashboard',
      label: 'Dashboard',
      icon: 'organization' as const,
    },
    ...(context?.personas.includes('ASSOCIATION_COORDINATOR')
      ? [
          { href: '/association/artisans', label: 'Artisan registry', icon: 'artisan' as const },
          {
            href: '/procurement/discussions',
            label: 'Order discussions',
            icon: 'support' as const,
          },
        ]
      : []),
    ...(context?.personas.includes('HIRFACARE_OPERATOR')
      ? [{ href: '/operator', label: 'Internal operations', icon: 'organization' as const }]
      : []),
    ...(context?.personas.includes('BUYER_REPRESENTATIVE')
      ? [{ href: '/buyer/company', label: 'Your company', icon: 'organization' as const }]
      : []),
    ...(context?.personas.includes('BUYER_REPRESENTATIVE') ||
    context?.personas.includes('HIRFACARE_OPERATOR') ||
    capabilities.operator
      ? [{ href: '/procurement', label: 'Procurement', icon: 'organization' as const }]
      : []),
    { href: '/commerce/catalog', label: 'Craft catalog', icon: 'artisan' as const },
    ...(capabilities.buyer
      ? [{ href: '/commerce/buyer', label: 'Buyer requests', icon: 'organization' as const }]
      : []),
    ...(capabilities.artisan
      ? [{ href: '/commerce/artisan', label: 'Offers & production', icon: 'artisan' as const }]
      : []),
    ...(capabilities.operator
      ? [
          { href: '/commerce/operator', label: 'Operator review', icon: 'organization' as const },
          { href: '/commerce/operator/artisan-groups', label: 'Artisan groups', icon: 'artisan' as const },
        ]
      : []),
  ];
  const account = [
    { href: '/settings/organizations', label: 'Organizations', icon: 'organization' as const },
    ...(context?.linkedArtisanProfileId
      ? [{ href: '/artisan/profile', label: 'Your artisan profile', icon: 'artisan' as const }]
      : []),
    { href: '/settings/profile', label: 'Your account', icon: 'users' as const },
    { href: '/settings/security', label: 'Security', icon: 'privacy' as const },
    { href: '/support/cases', label: 'Support', icon: 'support' as const },
    ...(capabilities.admin
      ? [{ href: '/admin', label: 'Administration', icon: 'approval' as const }]
      : []),
  ];
  function navigation(mobile = false) {
    return (
      <>
        <div className="sidebar-brand">
          <Wordmark href={context?.landingPath ?? '/dashboard'} />
        </div>
        <nav aria-label={mobile ? 'Mobile account navigation' : 'Account navigation'}>
          {[
            { label: 'Workspace', items: work },
            { label: 'Manage', items: account },
          ].map((section) => (
            <div className="sidebar-section" key={section.label}>
              <p className="sidebar-label">{section.label}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={pathname === item.href ? 'sidebar-link active' : 'sidebar-link'}
                      aria-current={pathname === item.href ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shell-user">
          <div className="user-identity">
            <span className="user-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <div>
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">{navigation()}</aside>
      <div className="app-main">
        <header className="topbar shell-header">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sidebar-toggle mobile-menu-button hidden max-[900px]:inline-flex"
                aria-label="Open navigation"
              >
                <Icon name="menu" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="mobile-sidebar w-[min(85vw,300px)] gap-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>NASJ navigation</SheetTitle>
                <SheetDescription>Navigate your workspaces and account settings.</SheetDescription>
              </SheetHeader>
              {navigation(true)}
            </SheetContent>
          </Sheet>
          {demo && <Badge variant="outline">Demo workspace</Badge>}
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="profile-trigger" aria-label="Account menu">
                <span className="avatar" aria-hidden="true">
                  {initials(name)}
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="profile-panel z-50"
                align="end"
                sideOffset={8}
                aria-label="Account settings"
              >
                <div className="profile-identity">
                  <strong>{name}</strong>
                  <span className="profile-email">{email}</span>
                </div>
                <ul role="presentation">
                  {profileMenuItems.map((item) => (
                    <li role="presentation" key={item.href}>
                      <DropdownMenu.Item asChild>
                        <Link
                          href={item.href}
                          aria-current={pathname === item.href ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenu.Item>
                    </li>
                  ))}
                </ul>
                <div className="profile-signout">
                  <LogoutButton menuItem />
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>
        <main className="workspace" id="main-content">
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
