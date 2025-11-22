'use client';

import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Inbox, MessageSquare, Network, FileText, Package, Settings } from 'lucide-react';

interface PageNavProps {
  currentPage: 'inbox' | 'ask' | 'graph' | 'audit' | 'export';
}

export function PageNav({ currentPage }: PageNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox },
    { id: 'ask', label: 'Ask', path: '/ask', icon: MessageSquare },
    { id: 'graph', label: 'Graph', path: '/graph', icon: Network },
    { id: 'audit', label: 'Audit', path: '/audit', icon: FileText },
    { id: 'export', label: 'Export', path: '/export', icon: Package },
  ];

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 dark:border-dark-surface-800 pb-4 mb-6 overflow-x-auto scrollbar-hide">
      {navItems.map((item) => {
        const isActive = item.id === currentPage;
        const Icon = item.icon;
        return (
          <motion.button
            key={item.path}
            onClick={() => router.push(item.path)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-gradient-primary text-white shadow-md'
                : 'text-body dark:text-dark-text-muted hover:bg-secondary/10 dark:hover:bg-secondary/20'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

