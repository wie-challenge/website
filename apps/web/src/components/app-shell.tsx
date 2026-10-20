'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { initials, isActive, profileMenuItems, sidebarSections } from '@/lib/app-navigation';
import { Wordmark } from './brand';
import { Icon } from './icons';
import { LogoutButton } from './logout-button';

type ShellUser = { name: string; email: string; isAdmin: boolean };

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setSidebarOpen(false), [pathname]);
  return (
    <div className={sidebarOpen ? 'app-shell sidebar-open' : 'app-shell'}>
      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-brand">
          <Wordmark href="/settings/profile" />
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          {sidebarSections
            .filter((section) => !section.adminOnly || user.isAdmin)
            .map((section) => (
              <div className="sidebar-section" key={section.label}>
                <p className="sidebar-label">{section.label}</p>
                <ul>
                  {section.items.map((item) => {
                    const active = isActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={active ? 'sidebar-link active' : 'sidebar-link'}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon name={item.icon} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </nav>
      </aside>
      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button sidebar-toggle"
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <ProfileMenu user={user} />
        </header>
        <main className="workspace" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProfileMenu({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    root.current?.addEventListener('keydown', onKey);
    const node = root.current;
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      node?.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="profile-menu" ref={root}>
      <button
        type="button"
        className="profile-trigger"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="profile-panel" id={menuId}>
          <div className="profile-identity">
            <strong>{user.name}</strong>
            <span className="profile-email">{user.email}</span>
          </div>
          <ul>
            {profileMenuItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="profile-signout">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
