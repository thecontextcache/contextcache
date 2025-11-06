'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project';
import { motion } from 'framer-motion';
import { Inbox, MessageSquare, Network, FileText, Package, Settings } from 'lucide-react';
import { EnhancedThemeToggle } from './enhanced-theme-toggle';

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentProject } = useProjectStore();

  if (!currentProject || pathname === '/dashboard' || pathname === '/dashboard/new' || pathname === '/') {
    return null;
  }

  const navItems = [
    { label: 'Inbox', path: '/inbox', icon: Inbox },
    { label: 'Ask', path: '/ask', icon: MessageSquare },
    { label: 'Graph', path: '/graph', icon: Network },
    { label: 'Audit', path: '/audit', icon: FileText },
    { label: 'Export', path: '/export', icon: Package },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <nav className="glass-card border-b border-border sticky top-[73px] z-40 shadow-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-3">
          {/* Navigation Items */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Theme Toggle */}
          <div className="flex-shrink-0">
            <EnhancedThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
