'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, ChevronDown } from 'lucide-react';

export interface ModelConfig {
  provider: 'huggingface' | 'openai' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string; // For Ollama or custom endpoints
  retrievalMethod?: 'standard' | 'rag-cag'; // RAG+CAG hybrid model
}

interface ModelSelectorPanelProps {
  value: ModelConfig;
  onChange: (config: ModelConfig) => void;
  className?: string;
}

export function ModelSelectorPanel({ value, onChange, className = '' }: ModelSelectorPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const providers = [
    { value: 'huggingface', label: 'HuggingFace (Free)', requiresKey: false },
    { value: 'openai', label: 'OpenAI', requiresKey: true },
    { value: 'ollama', label: 'Ollama (Local)', requiresKey: false },
    { value: 'custom', label: 'Custom Endpoint', requiresKey: true },
  ];

  const models = {
    huggingface: [
      { value: 'sentence-transformers/all-MiniLM-L6-v2', label: 'all-MiniLM-L6-v2 (Default, Fast)' },
      { value: 'sentence-transformers/all-mpnet-base-v2', label: 'all-mpnet-base-v2 (Better Quality)' },
    ],
    openai: [
      { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
      { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
      { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002 (Legacy)' },
    ],
    ollama: [
      { value: 'nomic-embed-text', label: 'nomic-embed-text' },
      { value: 'mxbai-embed-large', label: 'mxbai-embed-large' },
      { value: 'all-minilm', label: 'all-minilm' },
    ],
    custom: [],
  };

  const selectedProvider = providers.find(p => p.value === value.provider);
  const availableModels = models[value.provider as keyof typeof models] || [];

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-dark-surface-800 bg-surface dark:bg-dark-surface-800 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-dark-bg-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary-700/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary dark:text-primary-700" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-headline dark:text-dark-text-primary">
              AI Model Settings
            </div>
            <div className="text-xs text-body dark:text-dark-text-muted">
              {selectedProvider?.label} · {value.model || 'No model selected'}
              {value.retrievalMethod === 'rag-cag' && ' · RAG+CAG Hybrid'}
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
          {/* Retrieval Method */}
          <div>
            <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
              Retrieval Method
            </label>
            <select
              value={value.retrievalMethod || 'standard'}
              onChange={(e) => onChange({
                ...value,
                retrievalMethod: e.target.value as 'standard' | 'rag-cag',
              })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
            >
              <option value="standard">Standard (Semantic Search)</option>
              <option value="rag-cag">RAG+CAG Hybrid (BM25 + Dense + PageRank + Decay)</option>
            </select>
            <p className="text-xs text-body dark:text-dark-text-muted mt-2">
              {value.retrievalMethod === 'rag-cag' 
                ? '🎯 Advanced: Combines keyword matching (BM25), semantic search (Dense), graph importance (PageRank), and recency (Decay) with context-aware personalization'
                : '🔍 Simple: Fast semantic search using embeddings only'
              }
            </p>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
              Embedding Provider
            </label>
            <select
              value={value.provider}
              onChange={(e) => onChange({
                ...value,
                provider: e.target.value as ModelConfig['provider'],
                model: models[e.target.value as keyof typeof models]?.[0]?.value || '',
                apiKey: '',
              })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
            >
              {providers.map(provider => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          {availableModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
                Model
              </label>
              <select
                value={value.model}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
              >
                {availableModels.map(model => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Model Input */}
          {value.provider === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
                Model Name
              </label>
              <input
                type="text"
                value={value.model}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
                placeholder="my-custom-model"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
              />
            </div>
          )}

          {/* API Key Input */}
          {selectedProvider?.requiresKey && (
            <div>
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
                API Key {value.provider === 'openai' && '(Required)'}
              </label>
              <input
                type="password"
                value={value.apiKey || ''}
                onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
                placeholder={`Enter your ${selectedProvider.label} API key`}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
              />
              <p className="text-xs text-body dark:text-dark-text-muted mt-1">
                Your API key is encrypted and stored securely
              </p>
            </div>
          )}

          {/* Base URL for Ollama/Custom */}
          {(value.provider === 'ollama' || value.provider === 'custom') && (
            <div>
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-2">
                Base URL
              </label>
              <input
                type="text"
                value={value.baseUrl || (value.provider === 'ollama' ? 'http://localhost:11434' : '')}
                onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
                placeholder={value.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com'}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent"
              />
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-secondary/10 dark:bg-secondary/20 border border-secondary/30">
            <p className="text-xs text-body dark:text-dark-text-muted leading-relaxed">
              <strong className="text-secondary-700 dark:text-secondary">Note:</strong> HuggingFace is free and works out of the box. OpenAI and custom providers require an API key.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

