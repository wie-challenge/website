'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { landingContent } from '@/lib/landing-content';
import { EvidenceClaim } from '@/components/evidence/evidence-badge';

export function LandingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      toggleRef.current?.focus();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 text-foreground shadow-sm backdrop-blur dark:border-slate-700 dark:bg-[#101916]/95 dark:text-slate-100">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="#top"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            H
          </span>
          <span className="truncate">HirfaCare concept</span>
        </a>

        <nav aria-label="Concept navigation" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {landingContent.navigation.map((item) => (
              <li key={item.href}>
                <a
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            href="/commerce/catalog"
          >
            Synthetic catalog
          </a>
          <span className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground dark:text-slate-300">
            Presentation mode · TODO(team)
          </span>
        </div>

        <button
          ref={toggleRef}
          aria-controls="concept-mobile-menu"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          {isOpen ? (
            <X aria-hidden="true" className="h-5 w-5" />
          ) : (
            <Menu aria-hidden="true" className="h-5 w-5" />
          )}
        </button>
      </div>

      <div
        className={`${isOpen ? 'block' : 'hidden'} border-t border-border bg-background px-4 pb-4 pt-2 md:hidden dark:border-slate-700 dark:bg-[#101916]`}
        id="concept-mobile-menu"
      >
        <nav aria-label="Mobile concept navigation">
          <ul className="space-y-1">
            {landingContent.navigation.map((item) => (
              <li key={item.href}>
                <a
                  className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-100 dark:hover:bg-slate-800"
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-300"
                href="/commerce/catalog"
                onClick={() => setIsOpen(false)}
              >
                Explore synthetic catalog
              </a>
            </li>
          </ul>
        </nav>
        <div className="mt-2 border-t border-border pt-2 dark:border-slate-700">
          <EvidenceClaim claim={landingContent.brand} />
          <p className="mb-0 mt-2 text-xs text-muted-foreground dark:text-slate-300">
            Presentation mode · TODO(team)
          </p>
        </div>
      </div>
    </header>
  );
}
