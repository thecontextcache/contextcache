'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project';
import { motion } from 'framer-motion';
import { Inbox, MessageSquare, Network, FileText, Package, Settings, Sparkles } from 'lucide-react';
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
    <nav className="glass-card border-b border-white/10 sticky top-[73px] z-40 shadow-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-3">
          {/* Navigation Items */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-indigo-500/30'
                      : 'text-foreground/70 hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {isActive && (
                    <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-white animate-pulse" />
                  )}
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