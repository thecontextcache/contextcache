'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ChevronDown } from 'lucide-react';

export interface SimpleModelConfig {
  mode: 'smart' | 'custom';
  customName?: string;
}

interface SimpleModelSelectorProps {
  value: SimpleModelConfig;
  onChange: (config: SimpleModelConfig) => void;
  className?: string;
}

export function SimpleModelSelector({ value, onChange, className = '' }: SimpleModelSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-dark-surface-800 bg-surface dark:bg-dark-surface-800 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary-700/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary dark:text-primary-700" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-headline dark:text-dark-text-primary">
              AI Model
            </div>
            <div className="text-xs text-body dark:text-dark-text-muted">
              {value.mode === 'smart' ? 'thecontextcache Smart (Recommended)' : value.customName || 'Custom Model'}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-body dark:text-dark-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-gray-200 dark:border-dark-surface-800 p-4 space-y-4"
        >
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
              Select Model
            </label>
            <select
              value={value.mode}
              onChange={(e) => onChange({
                ...value,
                mode: e.target.value as 'smart' | 'custom',
              })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
            >
              <option value="smart">thecontextcache Smart (Free, Recommended)</option>
              <option value="custom">Your Own Model</option>
            </select>
          </div>

          {/* Smart Mode Info */}
          {value.mode === 'smart' && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-body dark:text-dark-text-muted">
                <strong className="text-primary">Smart Mode:</strong> Uses our hybrid RAG+CAG model 
                (BM25 + Semantic Search + Knowledge Graph). No API key needed. Free forever.
              </p>
            </div>
          )}

          {/* Custom Model Input */}
          {value.mode === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
                Model Name (Optional)
              </label>
              <input
                type="text"
                value={value.customName || ''}
                onChange={(e) => onChange({
                  ...value,
                  customName: e.target.value,
                })}
                placeholder="e.g., My Custom GPT"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
              />
              <p className="text-xs text-body dark:text-dark-text-muted mt-2">
                Give your custom model a name. Integration coming soon.
              </p>
            </div>
          )}

          {/* Future: Payment CTA */}
          {value.mode === 'custom' && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Coming Soon:</strong> Custom models and premium features will require a paid plan.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

