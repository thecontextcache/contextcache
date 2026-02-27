'use client';

import { cn } from '@/lib/cn';
import { auth, health } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, X, Mail, Camera } from 'lucide-react';
import { ServiceUnavailable } from './service-unavailable';
import { ThemeToggle } from './theme-toggle';

interface ShellProps {
  children: ReactNode;
}

interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/clients', label: 'Downloads' },
  { href: 'https://docs.thecontextcache.com', label: 'Docs', external: true },
];

/* ── Bluesky butterfly icon ───────────────────────────────── */
function BlueskyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.5 2 3 6.5 5.1 11c1.4 3 4.2 5.2 6.9 6.3-.3 1.1-.9 2.1-2 2.7-1.8 1-3.4.5-4.5-.1-.2-.1-.3.1-.2.3 1.5 2.2 4.5 2.8 6.7 1.8.5-.2.9-.5 1.3-.8h1.4c.4.3.8.6 1.3.8 2.2 1 5.2.4 6.7-1.8.1-.2 0-.4-.2-.3-1.1.6-2.7 1.1-4.5.1-1.1-.6-1.7-1.6-2-2.7 2.7-1.1 5.5-3.3 6.9-6.3C21 6.5 17.5 2 12 2z" />
    </svg>
  );
}

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    health.check()
      .then(() => { if (!cancelled) setHealthOk(true); })
      .catch(() => { if (!cancelled) setHealthOk(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    auth.me()
      .then(() => setIsLoggedIn(true))
      .catch(() => setIsLoggedIn(false));
  }, [hasMounted]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isDashboard = pathname.startsWith('/app') || pathname.startsWith('/admin') || pathname.startsWith('/brain');

  return (
    <div className="flex min-h-screen flex-col">
      {/* Overlay — same tree, never swaps */}
      {hasMounted && healthOk === false && <ServiceUnavailable />}

      {!isDashboard && (
        <header className="sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-semibold text-brand">{APP_NAME}</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-6 sm:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={cn(
                    'text-sm transition-colors hover:text-brand',
                    pathname === link.href ? 'text-brand' : 'text-ink-2'
                  )}
                >
                  {link.label}
                </Link>
              ))}
              {isLoggedIn ? (
                <Link
                  href="/app"
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/auth"
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                >
                  Sign in
                </Link>
              )}
              <ThemeToggle />
            </div>

            {/* Mobile menu toggle */}
            <button
              className="sm:hidden rounded-lg p-2 text-ink-2 hover:text-ink"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>

          {/* Mobile nav */}
          {menuOpen && (
            <div className="border-t border-line px-4 py-4 sm:hidden animate-fade-in">
              <div className="flex flex-col gap-3">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={cn(
                      'text-sm transition-colors',
                      pathname === link.href ? 'text-brand' : 'text-ink-2'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="mt-2">
                  {isLoggedIn ? (
                    <Link
                      href="/app"
                      className="block rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-white"
                    >
                      Dashboard
                    </Link>
                  ) : (
                    <Link
                      href="/auth"
                      className="block rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-white"
                    >
                      Sign in
                    </Link>
                  )}
                </div>
                <div>
                  <ThemeToggle className="w-full rounded-md border border-line bg-panel px-4 py-2 text-sm text-ink-2 hover:bg-bg-2 hover:text-ink" />
                </div>
              </div>
            </div>
          )}
        </header>
      )}

      <main className="flex-1">{children}</main>

      {!isDashboard && (
        <footer className="border-t border-line bg-bg-2/50">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {/* Column 1 — Brand */}
              <div>
                <span className="text-lg font-semibold text-brand">{APP_NAME}</span>
                <p className="mt-2 text-sm text-ink-2">Project Brain for AI Teams</p>
                <p className="mt-4 text-xs text-muted">
                  &copy; 2024&ndash;2026 TheContextCache.<br />
                  All rights reserved.
                </p>
              </div>

              {/* Column 2 — Product */}
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Product</h4>
                <ul className="space-y-3">
                  <li><Link href="/pricing" className="text-sm text-ink-2 transition-colors hover:text-brand">Pricing</Link></li>
                  <li><Link href="/clients" className="text-sm text-ink-2 transition-colors hover:text-brand">Downloads</Link></li>
                  <li>
                    <a href="https://docs.thecontextcache.com" target="_blank" rel="noopener noreferrer" className="text-sm text-ink-2 transition-colors hover:text-brand">
                      Documentation
                    </a>
                  </li>
                  <li><Link href="/waitlist" className="text-sm text-ink-2 transition-colors hover:text-brand">Waitlist</Link></li>
                </ul>
              </div>

              {/* Column 3 — Legal */}
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Legal</h4>
                <ul className="space-y-3">
                  <li><Link href="/legal#terms" className="text-sm text-ink-2 transition-colors hover:text-brand">Terms of Service</Link></li>
                  <li><Link href="/legal#privacy" className="text-sm text-ink-2 transition-colors hover:text-brand">Privacy Policy</Link></li>
                  <li><Link href="/legal#license" className="text-sm text-ink-2 transition-colors hover:text-brand">License</Link></li>
                </ul>
              </div>

              {/* Column 4 — Connect */}
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Connect</h4>
                <ul className="space-y-3">
                  <li>
                    <a href="https://instagram.com/thecontextcache" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-brand">
                      <Camera className="h-4 w-4" />
                      Instagram
                    </a>
                  </li>
                  <li>
                    <a href="https://bsky.app/profile/thecontextcache.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-brand">
                      <BlueskyIcon className="h-4 w-4" />
                      Bluesky
                    </a>
                  </li>
                  <li>
                    <a href="mailto:support@thecontextcache.com" className="inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-brand">
                      <Mail className="h-4 w-4" />
                      support@thecontextcache.com
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 sm:flex-row">
              <p className="text-xs text-muted">&copy; 2024&ndash;2026 TheContextCache. All rights reserved.</p>
              <p className="text-xs text-muted">Proprietary Software &mdash; All Rights Reserved</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
