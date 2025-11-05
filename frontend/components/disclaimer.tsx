'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Disclaimer() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        // ✅ ChatGPT-style: Full-width banner at bottom, above everything
        className="fixed bottom-0 left-0 right-0 z-[100] border-t border-amber-300 dark:border-amber-700/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left side: Icon + Message */}
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0 text-lg" aria-hidden="true">
              ⚠️
            </div>
            <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 leading-snug">
              <strong className="font-semibold">Reality Check:</strong>{' '}
              <span className="hidden sm:inline">
                ContextCache tries hard, but perfection is a myth. We're chasing it though—one hallucination-free fact at a time. Double-check the important stuff.
              </span>
              <span className="inline sm:hidden">
                AI isn't perfect. Double-check important info.
              </span>
            </p>
          </div>

          {/* Right side: Dismiss button */}
          <button
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 p-2 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            aria-label="Dismiss disclaimer"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}