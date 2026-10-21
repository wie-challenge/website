'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import type { IdentityContext } from '@nasj/contracts';
import {
  initials,
  profileMenuItems,
  workspaceNavigation,
  workspaceRoleLabel,
} from '@/lib/app-navigation';
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
  const sections = workspaceNavigation(context, capabilities);
  const roleLabel = workspaceRoleLabel(context);
  const activeHref = sections
    .flatMap((s) => s.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  function navigation(mobile = false) {
    return (
      <>
        <div className="sidebar-brand">
          <Wordmark href={context?.landingPath ?? '/dashboard'} />
        </div>
        <p className="sidebar-role">{roleLabel}</p>
        <nav aria-label={mobile ? 'Mobile account navigation' : 'Account navigation'}>
          {sections.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <p className="sidebar-label">{section.label}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={activeHref === item.href ? 'sidebar-link active' : 'sidebar-link'}
                      aria-current={activeHref === item.href ? 'page' : undefined}
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
              {name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div>
              <strong title={name}>{name}</strong>
              <span title={roleLabel}>{roleLabel}</span>
            </div>
          </div>
          <LogoutButton iconOnly />
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
          <div className="workspace-identity">
            <span className="workspace-identity-label">Workspace</span>
            <strong>{roleLabel}</strong>
          </div>
          {demo && (
            <Badge variant="outline" className="max-[600px]:hidden">
              Demo workspace
            </Badge>
          )}
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
                  <LogoutButton menuItem iconOnly />
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
