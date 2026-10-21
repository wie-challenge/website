'use client';
import type { IdentityContext } from '@hirfacare/contracts';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Store,
  ShoppingBag,
  Hammer,
  Building2,
  UserRound,
  ShieldCheck,
  LifeBuoy,
  Menu,
  PanelLeft,
  ChevronRight,
  LockKeyhole,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { LogoutButton } from './logout-button';
import { cn } from '@/lib/utils';

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const work = [
    { href: context?.landingPath ?? '/dashboard', label: 'Dashboard', icon: PanelLeft },
    ...(context?.personas.includes('ASSOCIATION_COORDINATOR')
      ? [{ href: '/association/artisans', label: 'Artisan registry', icon: Hammer }]
      : []),
    ...(context?.personas.includes('HIRFACARE_OPERATOR')
      ? [{ href: '/operator', label: 'Internal operations', icon: Building2 }]
      : []),
    ...(context?.personas.includes('BUYER_REPRESENTATIVE')
      ? [{ href: '/buyer/company', label: 'Your company', icon: Building2 }]
      : []),
    ...(context?.personas.includes('BUYER_REPRESENTATIVE') ||
    context?.personas.includes('HIRFACARE_OPERATOR') ||
    capabilities.operator
      ? [{ href: '/procurement', label: 'Procurement', icon: ShoppingBag }]
      : []),
    ...(context?.personas.includes('ASSOCIATION_COORDINATOR')
      ? [{ href: '/procurement/discussions', label: 'Order discussions', icon: ShoppingBag }]
      : []),
    { href: '/commerce/catalog', label: 'Craft catalog', icon: Store },
    ...(capabilities.buyer
      ? [{ href: '/commerce/buyer', label: 'Buyer requests', icon: ShoppingBag }]
      : []),
    ...(capabilities.artisan
      ? [{ href: '/commerce/artisan', label: 'Offers & production', icon: Hammer }]
      : []),
    ...(capabilities.operator
      ? [{ href: '/commerce/operator', label: 'Operator review', icon: PanelLeft }]
      : []),
  ];
  const account = [
    { href: '/settings/organizations', label: 'Organizations', icon: Building2 },
    ...(context?.linkedArtisanProfileId
      ? [{ href: '/artisan/profile', label: 'Your artisan profile', icon: Hammer }]
      : []),
    { href: '/settings/profile', label: 'Your account', icon: UserRound },
    { href: '/settings/security', label: 'Security', icon: LockKeyhole },
    { href: '/support/cases', label: 'Support', icon: LifeBuoy },
    ...(capabilities.admin ? [{ href: '/admin', label: 'Administration', icon: ShieldCheck }] : []),
  ];
  const active =
    [...work, ...account].find((item) => pathname === item.href) ??
    (pathname.startsWith('/commerce/') ? { label: 'Commerce' } : { label: 'Workspace' });
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  function navigation(mobile = false) {
    return (
      <div className="shell-navigation">
        <Link
          href={context?.landingPath ?? '/dashboard'}
          className="shell-brand"
          onClick={() => setOpen(false)}
        >
          <span className="brand-symbol" aria-hidden="true">
            h.
          </span>
          <span>
            HirfaCare<span className="brand-caption">Craft. Connect. Create.</span>
          </span>
        </Link>
        <nav aria-label={mobile ? 'Mobile account navigation' : 'Account navigation'}>
          {[
            { title: 'Workspace', items: work },
            { title: 'Manage', items: account },
          ].map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-group-label">{group.title}</p>
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? 'page' : undefined}
                  className={cn('shell-nav-link', pathname === href && 'is-active')}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="shell-user">
          <div className="user-identity">
            <span className="user-avatar" aria-hidden="true">
              {initials}
            </span>
            <div>
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">{navigation()}</aside>
      <div className="shell-main">
        <header className="shell-header">
          <div className="shell-breadcrumb">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu-button md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar w-[min(85vw,300px)] gap-0 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>HirfaCare navigation</SheetTitle>
                  <SheetDescription>
                    Navigate your workspaces and account settings.
                  </SheetDescription>
                </SheetHeader>
                {navigation(true)}
              </SheetContent>
            </Sheet>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{active.label}</span>
          </div>
          {demo && (
            <Badge variant="outline" className="demo-indicator">
              <span aria-hidden="true" />
              Demo workspace
            </Badge>
          )}
        </header>
        <main className="workspace" id="main-content">
          {children}
        </main>
        <footer className="shell-footer">
          HirfaCare<span>Made for thoughtful collaboration.</span>
        </footer>
      </div>
    </div>
  );
}
