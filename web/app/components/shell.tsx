'use client';

import { cn } from '@/lib/cn';
import { health } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { ServiceUnavailable } from './service-unavailable';

interface ShellProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/clients', label: 'Downloads' },
];

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);
  }, [pathname]);

  const isDashboard = pathname.startsWith('/app') || pathname.startsWith('/admin') || pathname.startsWith('/brain');

  return (
    <div className="flex min-h-screen flex-col">
      {/* Overlay — same tree, never swaps */}
      {hasMounted && healthOk === false && <ServiceUnavailable />}

      {!isDashboard && (
        <header className="glass sticky top-0 z-40 border-b border-line">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-display text-lg font-bold gradient-text">{APP_NAME}</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-6 sm:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'text-sm transition-colors hover:text-brand',
                    pathname === link.href ? 'text-brand' : 'text-ink-2'
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/auth"
                className="rounded-lg bg-gradient-to-r from-brand to-violet px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-glow"
              >
                Sign in
              </Link>
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
                    className={cn(
                      'text-sm transition-colors',
                      pathname === link.href ? 'text-brand' : 'text-ink-2'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/auth"
                  className="mt-2 rounded-lg bg-gradient-to-r from-brand to-violet px-4 py-2 text-center text-sm font-medium text-white"
                >
                  Sign in
                </Link>
              </div>
            </div>
          )}
        </header>
      )}

      <main className="flex-1">{children}</main>

      {!isDashboard && (
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between sm:px-6">
            <span className="font-display text-sm text-muted">{APP_NAME}</span>
            <div className="flex gap-6 text-sm text-muted">
              <Link href="/legal" className="transition-colors hover:text-ink-2">Legal</Link>
              <Link href="/waitlist" className="transition-colors hover:text-ink-2">Waitlist</Link>
              <Link href="/clients" className="transition-colors hover:text-ink-2">Downloads</Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
