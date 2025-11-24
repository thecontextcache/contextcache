'use client';

import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Upload, MessageSquare, Network, Database } from 'lucide-react';

interface PageNavProps {
  currentPage: 'inbox' | 'ask' | 'graph' | 'data';
}

export function PageNav({ currentPage }: PageNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { id: 'inbox', label: 'Upload', path: '/inbox', icon: Upload, description: 'Add documents' },
    { id: 'ask', label: 'Ask', path: '/ask', icon: MessageSquare, description: 'Query your knowledge' },
    { id: 'graph', label: 'Explore', path: '/graph', icon: Network, description: 'Browse entities' },
    { id: 'data', label: 'Data', path: '/data', icon: Database, description: 'Audit & export' },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      {navItems.map((item) => {
        const isActive = item.id === currentPage;
        const Icon = item.icon;
        return (
          <motion.button
            key={item.path}
            onClick={() => router.push(item.path)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title={item.description}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

