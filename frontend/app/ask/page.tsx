'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

interface Source {
  id: string;
  title: string;
  url: string;
  relevance: number;
}

interface Explanation {
  facts: Fact[];
  sources: Source[];
  reasoning: string;
}

export default function AskPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [asking, setAsking] = useState(false);

  const handleAsk = async () => {
    if (!question.trim() || !currentProject) return;

    setAsking(true);
    setAnswer(null);
    setExplanation(null);

    try {
      console.log('🔍 Querying:', question);
      const response = await api.query(currentProject.id, question, 5);
      console.log('✅ Query response:', response);

      if (response.results && response.results.length > 0) {
        // ✅ Filter results by similarity threshold (only show relevant chunks)
        const relevantChunks = response.results.filter((r: any) => r.similarity > 0.2);

        if (relevantChunks.length === 0) {
          setAnswer('No relevant information found in your documents.');
          setExplanation({
            facts: [],
            sources: [],
            reasoning:
              'No chunks met the relevance threshold. Try rephrasing your question.',
          });
          return;
        }

        // ✅ Take top 3 relevant results
        const topChunks = relevantChunks.slice(0, 3);
        const answerText = topChunks.map((r: any) => r.text).join('\n\n');
        setAnswer(answerText);

        // ✅ Build explanation from filtered results
        setExplanation({
          facts: topChunks.map((r: any) => ({
            id: r.chunk_id,
            subject: r.source_url || 'Unknown',
            predicate: 'contains',
            object: r.text.substring(0, 100) + '...',
            confidence: r.similarity,
          })),
          sources: topChunks.map((r: any) => ({
            id: r.document_id,
            title: r.source_url || 'Document',
            url: r.source_url,
            relevance: r.similarity,
          })),
          reasoning: `Found ${relevantChunks.length} relevant chunks (similarity > 20%). Showing top ${topChunks.length} results.`,
        });
      } else {
        setAnswer('No relevant information found in your documents.');
        setExplanation({
          facts: [],
          sources: [],
          reasoning:
            'No matching content found. Try uploading more documents or rephrasing your question.',
        });
      }
    } catch (error) {
      console.error('❌ Query failed:', error);
      setAnswer('Failed to get answer. Please try again.');
    } finally {
      setAsking(false);
    }
  };

  // 🔹 When no project is selected
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

  // 🔹 Main UI
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
                Query your knowledge in {currentProject.name}
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
        <div className="max-w-6xl mx-auto">
          {/* Question Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex gap-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Ask a question about your documents..."
                className="flex-1 px-6 py-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-lg"
                disabled={asking}
              />
              <button
                onClick={handleAsk}
                disabled={asking || !question.trim()}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20"
              >
                {asking ? 'Thinking...' : 'Ask'}
              </button>
            </div>
          </motion.div>

          {/* Answer & Explanation */}
          <AnimatePresence mode="wait">
            {answer && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Answer */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="lg:col-span-2 p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
                >
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                    Answer
                  </h2>
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {answer}
                    </p>
                  </div>
                </motion.div>

                {/* Explanation Panel */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                      💡 Explain
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {explanation?.reasoning}
                    </p>
                  </div>

                  {/* Sources */}
                  {explanation && explanation.sources.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        📚 Sources
                      </h4>
                      <div className="space-y-2">
                        {explanation.sources.map((source, index) => (
                          <div
                            key={`${source.id}-${index}`}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700"
                          >
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {source.title}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Relevance
                              </span>
                              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                                {(source.relevance * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Facts */}
                  {explanation && explanation.facts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        🔍 Key Facts ({explanation.facts.length})
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {explanation.facts.map((fact) => (
                          <div
                            key={fact.id}
                            className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs"
                          >
                            <p className="text-slate-700 dark:text-slate-300">
                              <span className="font-semibold">{fact.subject}</span>{' '}
                              <span className="text-slate-500">{fact.predicate}</span>{' '}
                              <span className="text-slate-600 dark:text-slate-400">
                                {fact.object}
                              </span>
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-cyan-500"
                                  style={{ width: `${fact.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {(fact.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Loading State */}
          {asking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full mx-auto mb-4"
              />
              <p className="text-slate-600 dark:text-slate-400">
                Searching your documents...
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
