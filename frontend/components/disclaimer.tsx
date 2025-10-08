'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Disclaimer() {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <AnimatePresence>
      {!isMinimized ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 right-4 max-w-sm z-50"
        >
          <div className="relative p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 backdrop-blur-sm shadow-xl">
            <button
              onClick={() => setIsMinimized(true)}
              className="absolute top-2 right-2 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              aria-label="Minimize"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div className="flex items-start gap-3 pr-6">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                  Reality Check
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <strong>thecontextcache</strong> tries hard, but perfection is a myth. We're chasing it though—one hallucination-free fact at a time. Double-check the important stuff. 🤷
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-4 right-4 z-50 p-3 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg hover:shadow-xl transition-all"
          aria-label="Show disclaimer"
        >
          <span className="text-xl">⚠️</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}