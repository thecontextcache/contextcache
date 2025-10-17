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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-2xl w-full mx-4 z-50"
        >
          <div className="relative p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-300 dark:border-amber-700 backdrop-blur-md shadow-lg">
            <button
              onClick={() => setIsMinimized(true)}
              className="absolute top-2 right-2 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              aria-label="Minimize"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center justify-center gap-3 pr-6">
              <span className="text-xl">⚠️</span>
              <p className="text-xs text-amber-900 dark:text-amber-200 text-center">
                <strong>Reality Check:</strong> ContextCache tries hard, but perfection is a myth. We're chasing it though—one hallucination-free fact at a time. Double-check the important stuff. 🤷
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          aria-label="Show disclaimer"
        >
          <span className="text-sm">⚠️</span>
          <span>Reality Check</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}