'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project';
import { motion } from 'framer-motion';

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentProject } = useProjectStore();

  if (!currentProject || pathname === '/dashboard' || pathname === '/dashboard/new' || pathname === '/') {
    return null;
  }

  const navItems = [
    { label: 'Inbox', path: '/inbox', icon: '📥' },
    { label: 'Ask', path: '/ask', icon: '💬' },
    { label: 'Graph', path: '/graph', icon: '🕸️' },
    { label: 'Audit', path: '/audit', icon: '📋' },
    { label: 'Export', path: '/export', icon: '📦' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-[73px] z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <motion.button
                key={item.path}
                onClick={() => router.push(item.path)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}