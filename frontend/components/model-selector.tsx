'use client'

import { useState } from 'react'
import { Check, ChevronDown, Sparkles, Zap, Brain, Target } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type AIModel = {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  badge?: string
  features: string[]
  speed: 'fast' | 'medium' | 'slow'
}

const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'vector-similarity',
    name: 'Vector Similarity',
    description: 'Fast semantic search using sentence embeddings',
    icon: <Zap className="h-5 w-5" />,
    badge: 'Default',
    features: ['Lightning fast', 'Semantic understanding', 'Free tier'],
    speed: 'fast',
  },
  {
    id: 'hybrid-ranking',
    name: 'Hybrid Ranking',
    description: 'Combines BM25 + dense vectors + PageRank',
    icon: <Target className="h-5 w-5" />,
    badge: 'Beta',
    features: ['Best accuracy', 'Multi-signal', 'Context-aware'],
    speed: 'medium',
  },
  {
    id: 'neural-rerank',
    name: 'Neural Reranker',
    description: 'Advanced cross-encoder for precise results',
    icon: <Brain className="h-5 w-5" />,
    badge: 'Premium',
    features: ['Highest quality', 'Deep understanding', 'Coming soon'],
    speed: 'slow',
  },
]

interface ModelSelectorProps {
  selected: string
  onChange: (modelId: string) => void
}

export function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedModel = AVAILABLE_MODELS.find((m) => m.id === selected) || AVAILABLE_MODELS[0]

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-card px-4 py-3 w-full flex items-center justify-between gap-3
                   hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20">
            {selectedModel.icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{selectedModel.name}</span>
              {selectedModel.badge && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                  {selectedModel.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{selectedModel.description}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-300 ${
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
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute top-full mt-2 left-0 right-0 z-50 glass-intense rounded-2xl p-2
                         shadow-2xl border border-white/10 max-h-[400px] overflow-y-auto"
            >
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = model.id === selected
                const isDisabled = model.badge === 'Coming soon'

                return (
                  <motion.button
                    key={model.id}
                    onClick={() => {
                      if (!isDisabled) {
                        onChange(model.id)
                        setIsOpen(false)
                      }
                    }}
                    disabled={isDisabled}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200
                              ${
                                isSelected
                                  ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30'
                                  : 'hover:bg-white/5'
                              }
                              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                              relative group`}
                    whileHover={!isDisabled ? { scale: 1.02 } : {}}
                    whileTap={!isDisabled ? { scale: 0.98 } : {}}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-4 right-4"
                      >
                        <div className="p-1 rounded-full bg-primary">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      </motion.div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={`p-2 rounded-xl transition-colors ${
                          isSelected
                            ? 'bg-primary/30 text-primary'
                            : 'bg-white/5 text-muted-foreground group-hover:bg-white/10'
                        }`}
                      >
                        {model.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{model.name}</h3>
                          {model.badge && (
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                model.badge === 'Coming soon'
                                  ? 'bg-muted/50 text-muted-foreground'
                                  : model.badge === 'Premium'
                                  ? 'bg-accent/20 text-accent'
                                  : 'bg-primary/20 text-primary'
                              }`}
                            >
                              {model.badge}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground mb-2">{model.description}</p>

                        {/* Features */}
                        <div className="flex flex-wrap gap-2">
                          {model.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-2 py-1 text-xs rounded-lg bg-white/5 text-muted-foreground"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>

                        {/* Speed indicator */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Speed:</span>
                          <div className="flex gap-1">
                            {[...Array(3)].map((_, i) => (
                              <div
                                key={i}
                                className={`h-1.5 w-6 rounded-full ${
                                  i <
                                  (model.speed === 'fast' ? 3 : model.speed === 'medium' ? 2 : 1)
                                    ? 'bg-primary'
                                    : 'bg-white/10'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Hover glow effect */}
                    {!isDisabled && (
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100
                                   transition-opacity duration-300 pointer-events-none"
                        style={{
                          boxShadow: '0 0 20px rgba(79, 70, 229, 0.2)',
                        }}
                      />
                    )}
                  </motion.button>
                )
              })}

              {/* Footer */}
              <div className="mt-2 p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  All models run on free-tier resources
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
