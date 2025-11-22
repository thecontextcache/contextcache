'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { Send, Sparkles, FileText, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { AuthGuard } from '@/components/auth-guard';
import { toast } from 'sonner';
import { PageNav } from '@/components/page-nav';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    url: string;
    relevance: number;
  }>;
  timestamp: Date;
}

export default function AskPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !currentProject || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Use thecontextcache Smart (RAG+CAG) by default
      const modelConfig = {
        provider: 'thecontextcache',
        model: 'smart',
      };

      // Query with answer generation using our RAG+CAG system
      const response = await api.queryWithAnswer(
        currentProject.id,
        userMessage.content,
        5,
        modelConfig,
        'free', // User tier (will be dynamic later)
        'global',
        true // Apply CAG rules
      );

      if (response.answer) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.answer,
          sources: response.sources?.map((s: any, idx: number) => ({
            id: s.id || `source-${idx}`,
            title: s.title || s.text?.substring(0, 50) || 'Document',
            url: s.url || '#',
            relevance: s.relevance || s.similarity || 0,
          })) || [],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'No information found. Please upload documents to your project first.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: any) {
      console.error('Query failed:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error('Query failed', { description: errorMsg });
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMsg}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // No project selected
  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="text-6xl">📚</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              No Project Selected
            </h2>
            <p className="text-muted-foreground">
              Please select or create a project first
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Ask thecontextcache™
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {currentProject.name} • Powered by RAG+CAG
                  </p>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Dashboard
              </button>
            </div>
            
            {/* Project Navigation */}
            <PageNav currentPage="ask" />
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20 space-y-6"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground">
                    Ask anything about your documents
                  </h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    I'll search through your knowledge base and provide answers with sources.
                  </p>
                </div>

                {/* Example questions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto mt-8">
                  {[
                    'What are the main topics covered?',
                    'Summarize the key findings',
                    'What methods were used?',
                    'What are the conclusions?',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(example)}
                      className="p-4 text-left glass-card hover:border-primary/50 transition-all rounded-lg border border-border"
                    >
                      <p className="text-sm text-foreground">{example}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-4 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] space-y-2 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3'
                          : 'bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>

                      {/* Sources */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="pt-3 border-t border-border/50 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Sources ({message.sources.length})
                          </p>
                          <div className="space-y-1">
                            {message.sources.map((source, idx) => (
                              <div
                                key={`${source.id}-${idx}`}
                                className="text-xs p-2 rounded-lg bg-accent/50 flex items-center justify-between"
                              >
                                <span className="truncate flex-1">
                                  [{idx + 1}] {source.title}
                                </span>
                                <span className="text-primary font-semibold ml-2">
                                  {(source.relevance * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground/60 pt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>

                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-sm font-semibold">You</span>
                      </div>
                    )}
                  </motion.div>
                ))}

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-4"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                    </div>
                    <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4 max-w-4xl">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask a question about your documents..."
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                  rows={1}
                  style={{
                    minHeight: '48px',
                    maxHeight: '200px',
                    height: 'auto',
                  }}
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-3 bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                title="Send message (Enter)"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
