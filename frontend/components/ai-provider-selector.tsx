'use client';

import { useState } from 'react';
import { Check, ChevronDown, Cpu, Cloud, Server, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type AIProvider = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  features: string[];
  requiresApiKey: boolean;
  isLocal?: boolean;
};

const AVAILABLE_PROVIDERS: AIProvider[] = [
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Open-source models via sentence-transformers',
    icon: <Cpu className="h-5 w-5" />,
    badge: 'Default',
    features: ['Free', 'Privacy-first', 'Local processing', 'Fast embeddings'],
    requiresApiKey: false,
    isLocal: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run LLMs locally on your machine',
    icon: <Server className="h-5 w-5" />,
    badge: 'Local',
    features: ['100% Private', 'Self-hosted', 'Multiple models', 'Zero latency'],
    requiresApiKey: false,
    isLocal: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for embeddings and completion',
    icon: <Cloud className="h-5 w-5" />,
    features: ['High quality', 'Fast API', 'Large context', 'Requires API key'],
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Constitutional AI for safe, helpful responses',
    icon: <Sparkles className="h-5 w-5" />,
    features: ['Long context', 'Safe outputs', '100k tokens', 'Requires API key'],
    requiresApiKey: true,
  },
];

interface AIProviderSelectorProps {
  selected: string;
  onChange: (providerId: string) => void;
  apiKeys?: Record<string, string>;
  onSaveApiKey?: (providerId: string, apiKey: string) => void;
}

export function AIProviderSelector({
  selected,
  onChange,
  apiKeys = {},
  onSaveApiKey,
}: AIProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');

  const selectedProvider = AVAILABLE_PROVIDERS.find((p) => p.id === selected) || AVAILABLE_PROVIDERS[0];

  const handleProviderSelect = (provider: AIProvider) => {
    if (provider.requiresApiKey && !apiKeys[provider.id]) {
      setShowApiKeyInput(provider.id);
    } else {
      onChange(provider.id);
      setIsOpen(false);
    }
  };

  const handleSaveApiKey = (providerId: string) => {
    if (onSaveApiKey && tempApiKey.trim()) {
      onSaveApiKey(providerId, tempApiKey.trim());
      onChange(providerId);
      setShowApiKeyInput(null);
      setTempApiKey('');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-card px-4 py-3 w-full flex items-center justify-between gap-3
                   hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border border-border"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${selectedProvider.isLocal ? 'bg-success/20' : 'bg-primary/20'}`}>
            {selectedProvider.icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{selectedProvider.name}</span>
              {selectedProvider.badge && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  selectedProvider.isLocal ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                }`}>
                  {selectedProvider.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{selectedProvider.description}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-foreground transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false);
                setShowApiKeyInput(null);
              }}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute top-full mt-2 left-0 right-0 z-50 glass-card rounded-2xl p-2
                         shadow-2xl border border-border max-h-[500px] overflow-y-auto"
            >
              {AVAILABLE_PROVIDERS.map((provider) => {
                const isSelected = provider.id === selected;
                const hasApiKey = apiKeys[provider.id];
                const needsApiKey = provider.requiresApiKey && !hasApiKey;

                return (
                  <div key={provider.id}>
                    <motion.button
                      onClick={() => handleProviderSelect(provider)}
                      className={`w-full p-4 rounded-xl text-left transition-all duration-200
                                ${
                                  isSelected
                                    ? 'bg-primary/10 border border-primary/30'
                                    : 'hover:bg-muted'
                                }
                                relative group`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Selection indicator */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-4 right-4"
                        >
                          <div className="p-1 rounded-full bg-primary">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </motion.div>
                      )}

                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                          className={`p-2 rounded-xl transition-colors ${
                            isSelected
                              ? provider.isLocal
                                ? 'bg-success/30 text-success'
                                : 'bg-primary/30 text-primary'
                              : provider.isLocal
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          {provider.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pr-8">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-foreground">{provider.name}</h3>
                            {provider.badge && (
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  provider.isLocal
                                    ? 'bg-success/20 text-success'
                                    : 'bg-primary/20 text-primary'
                                }`}
                              >
                                {provider.badge}
                              </span>
                            )}
                            {needsApiKey && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-warning/20 text-warning">
                                API Key Required
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-muted-foreground mb-2">{provider.description}</p>

                          {/* Features */}
                          <div className="flex flex-wrap gap-2">
                            {provider.features.map((feature) => (
                              <span
                                key={feature}
                                className="px-2 py-1 text-xs rounded-lg bg-muted text-muted-foreground"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.button>

                    {/* API Key Input */}
                    {showApiKeyInput === provider.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-4"
                      >
                        <div className="p-3 bg-muted rounded-lg space-y-3">
                          <div>
                            <label className="text-sm font-medium text-foreground block mb-2">
                              Enter {provider.name} API Key
                            </label>
                            <input
                              type="password"
                              value={tempApiKey}
                              onChange={(e) => setTempApiKey(e.target.value)}
                              placeholder="sk-..."
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg
                                       text-foreground placeholder-muted-foreground focus:outline-none
                                       focus:ring-2 focus:ring-primary"
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveApiKey(provider.id)}
                              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg
                                       hover:opacity-90 transition-opacity font-medium text-sm"
                            >
                              Save & Use
                            </button>
                            <button
                              onClick={() => {
                                setShowApiKeyInput(null);
                                setTempApiKey('');
                              }}
                              className="px-4 py-2 bg-muted text-foreground rounded-lg
                                       hover:bg-muted/80 transition-colors font-medium text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}

              {/* Footer */}
              <div className="mt-2 p-3 text-center border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Local providers (Ollama, Hugging Face) keep your data 100% private
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
