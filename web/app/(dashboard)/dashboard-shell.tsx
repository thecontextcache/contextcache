'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { auth } from '@/lib/api';
import { APP_NAME, NAV_ITEMS } from '@/lib/constants';
import {
  LayoutDashboard,
  Key,
  Building2,
  Brain,
  Shield,
  BarChart3,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const sidebarItems = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/api-keys', label: 'API Keys', icon: Key },
  { href: '/app/orgs', label: 'Organisation', icon: Building2 },
  { href: '/app/usage', label: 'Usage', icon: BarChart3 },
  { href: '/brain', label: 'Brain', icon: Brain },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; is_admin: boolean } | null>(null);

  useEffect(() => {
    auth.me()
      .then(setUser)
      .catch(() => {
        /* middleware handles redirect */
      });
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  async function handleLogout() {
    try {
      await auth.logout();
    } catch {
      // Best effort
    }
    router.push('/');
  }

  const visibleItems = sidebarItems.filter((item) => {
    if ('adminOnly' in item && item.adminOnly && !user?.is_admin) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen">
      {/* Mobile sidebar toggle */}
      <button
        className="fixed left-4 top-4 z-50 rounded-lg border border-line bg-panel p-2 text-ink-2 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-bg-2 transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center border-b border-line px-6">
          <Link href="/" className="font-display text-sm font-bold gradient-text">
            {APP_NAME}
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/app'
                ? pathname === '/app'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-brand/10 text-brand'
                    : 'text-ink-2 hover:bg-bg/50 hover:text-ink'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          {user && (
            <div className="mb-2 truncate px-3 text-xs text-muted">{user.email}</div>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-bg/50 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="mx-auto max-w-5xl flex-1 px-4 py-8 lg:px-8">
          {children}
        </div>

        {/* Dashboard footer */}
        <footer className="border-t border-line bg-bg-2/30 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4">
                <Link href="/" className="font-display text-xs font-bold gradient-text">
                  {APP_NAME}
                </Link>
                <span className="text-xs text-muted">
                  &copy; 2024&ndash;2026 TheContextCache. All rights reserved.
                </span>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/legal"
                  className="text-xs text-muted transition-colors hover:text-ink-2"
                >
                  Legal
                </Link>
                <a
                  href="https://docs.thecontextcache.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted transition-colors hover:text-ink-2"
                >
                  Docs
                </a>
                <a
                  href="mailto:support@thecontextcache.com"
                  className="text-xs text-muted transition-colors hover:text-ink-2"
                >
                  Support
                </a>
                <a
                  href="https://instagram.com/thecontextcache"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted transition-colors hover:text-ink-2"
                >
                  Instagram
                </a>
                <a
                  href="https://bsky.app/profile/thecontextcache.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted transition-colors hover:text-ink-2"
                >
                  Bluesky
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
