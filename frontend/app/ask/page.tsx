'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';

interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  context: string;
  confidence: number;
  rank_score: number;
  similarity: number;
}

interface ExplainData {
  pagerank_score: number;
  decay_factor: number;
  semantic_similarity: number;
  reasoning: string;
  source_url?: string;
  source_title?: string;
}

export default function AskPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Fact[]>([]);
  const [selectedFact, setSelectedFact] = useState<Fact | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  // Mock data for demonstration
  const mockExplainData: ExplainData = {
    pagerank_score: 0.92,
    decay_factor: 0.95,
    semantic_similarity: 0.93,
    reasoning:
      'High pagerank due to connections to Nobel Prize facts. Recent creation (30 days) maintains strong decay factor. Query embedding closely matches subject and predicate.',
    source_url: 'https://en.wikipedia.org/wiki/Marie_Curie',
    source_title: 'Marie Curie - Wikipedia',
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults([]);
    setSelectedFact(null);

    // Simulate API call with mock data
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const mockResults: Fact[] = [
      {
        id: '1',
        subject: 'Marie Curie',
        predicate: 'discovered',
        object: 'Radium',
        context: 'Research paper: Curie, M. (1898)',
        confidence: 0.98,
        rank_score: 0.87,
        similarity: 0.94,
      },
      {
        id: '2',
        subject: 'Marie Curie',
        predicate: 'won',
        object: 'Nobel Prize in Physics',
        context: '1903',
        confidence: 0.95,
        rank_score: 0.92,
        similarity: 0.89,
      },
      {
        id: '3',
        subject: 'Pierre Curie',
        predicate: 'collaborated with',
        object: 'Marie Curie',
        context: 'Radioactivity research',
        confidence: 0.91,
        rank_score: 0.78,
        similarity: 0.82,
      },
    ];

    setResults(mockResults);
    setLoading(false);
  };

  const handleExplain = (fact: Fact) => {
    setSelectedFact(fact);
    setShowExplain(true);
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="text-6xl">📁</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              No Project Selected
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Please select or create a project first
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Ask
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Query {currentProject.name}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Search Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What did Marie Curie discover?"
                className="w-full px-6 py-4 pr-32 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-lg shadow-lg"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  'Ask'
                )}
              </button>
            </form>
          </motion.div>

          {/* Results */}
          {results.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Facts List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Results ({results.length})
                  </h2>
                </div>

                <AnimatePresence>
                  {results.map((fact, index) => (
                    <motion.div
                      key={fact.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 transition-all group"
                    >
                      {/* Fact Content */}
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-slate-900 dark:text-white font-medium flex-1">
                            <span className="text-cyan-500">{fact.subject}</span>{' '}
                            <span className="text-slate-400 dark:text-slate-500">
                              {fact.predicate}
                            </span>{' '}
                            <span className="text-blue-500">{fact.object}</span>
                          </p>
                          <button
                            onClick={() => handleExplain(fact)}
                            className="px-3 py-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                          >
                            Explain
                          </button>
                        </div>

                        {/* Context */}
                        {fact.context && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            📄 {fact.context}
                          </p>
                        )}

                        {/* Scores */}
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500">
                              Confidence:
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {(fact.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500">Rank:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {(fact.rank_score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500">
                              Similarity:
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {(fact.similarity * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Explain Panel */}
              <div className="lg:col-span-1">
                <AnimatePresence mode="wait">
                  {showExplain && selectedFact ? (
                    <motion.div
                      key="explain"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="sticky top-24 p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          Explain
                        </h3>
                        <button
                          onClick={() => setShowExplain(false)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Score Breakdown */}
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              PageRank
                            </span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {(mockExplainData.pagerank_score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${mockExplainData.pagerank_score * 100}%`,
                              }}
                              transition={{ duration: 1, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              Time Decay
                            </span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {(mockExplainData.decay_factor * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${mockExplainData.decay_factor * 100}%`,
                              }}
                              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              Similarity
                            </span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {(mockExplainData.semantic_similarity * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${mockExplainData.semantic_similarity * 100}%`,
                              }}
                              transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
                              className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Reasoning */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                          Reasoning
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {mockExplainData.reasoning}
                        </p>
                      </div>

                      {/* Source */}
                      {mockExplainData.source_url && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                            Source
                          </h4>
                          <a
                            href={mockExplainData.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline break-all"
                          >
                            {mockExplainData.source_title ||
                              mockExplainData.source_url}
                          </a>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="sticky top-24 p-12 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-dashed border-slate-300 dark:border-slate-700 text-center"
                    >
                      <div className="text-4xl mb-3">💡</div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Click "Explain" on any fact to see detailed reasoning
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && results.length === 0 && query && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 space-y-4"
            >
              <div className="text-6xl">🔍</div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  No results found
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Try a different query or import more documents
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
