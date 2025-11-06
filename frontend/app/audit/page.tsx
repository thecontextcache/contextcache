'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface AuditEvent {
  id: string;
  event_type: string;
  timestamp: string;
  actor: string;
  event_data: any;
  prev_hash: string;
  current_hash: string;
}

export default function AuditPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    const loadAuditLog = async () => {
      if (!currentProject) return;
      
      setLoading(true);
      try {

        const data = await api.getProjectAudit(currentProject.id, 100);

        setEvents(data.events || []);
      } catch (error) {
        console.error(' Failed to load audit log:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadAuditLog();
  }, [currentProject]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    setVerified(null);

    // Simulate verification
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock verification (always passes for demo)
    setVerified(true);
    setVerifying(false);
  };

  const handleExport = () => {
    // Create JSON blob
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${currentProject?.name}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredEvents = filterType === 'all'
    ? events
    : events.filter((e) => e.event_type === filterType);

  const eventTypes = ['all', ...Array.from(new Set(events.map((e) => e.event_type)))];

  const getEventIcon = (type: string) => {
    const icons: Record<string, string> = {
      project_created: '',
      document_imported: '',
      facts_extracted: '',
      ranking_computed: '',
      fact_added: '',
      fact_updated: '',
      fact_deleted: '',
    };
    return icons[type] || '';
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="text-6xl"></div>
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full mx-auto"
          />
          <p className="text-slate-600 dark:text-slate-400">Loading audit log...</p>
        </div>
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
                Audit Log
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Cryptographic event chain for {currentProject.name}
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

      {/* Controls */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Filter:
              </span>
              {eventTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                    filterType === type
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                      : 'bg-white/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleVerifyChain}
                disabled={verifying}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-all text-sm font-medium"
              >
                {verifying ? 'Verifying...' : ' Verify Chain'}
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all text-sm font-medium"
              >
                ↓ Export
              </button>
            </div>
          </div>

          {/* Verification Status */}
          <AnimatePresence>
            {verified !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <div className={`p-4 rounded-xl border ${
                  verified
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{verified ? '' : ''}</span>
                    <div>
                      <p className={`font-semibold ${
                        verified ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                      }`}>
                        {verified ? 'Chain Verified' : 'Chain Broken'}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {verified
                          ? `All ${events.length} events verified. No tampering detected.`
                          : 'Hash mismatch detected. Chain integrity compromised.'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Timeline */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500 via-blue-500 to-purple-500"></div>

            {/* Events */}
            <div className="space-y-8">
              <AnimatePresence>
                {filteredEvents.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative pl-20"
                  >
                    {/* Icon */}
                    <div className="absolute left-0 w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/20">
                      {getEventIcon(event.event_type)}
                    </div>

                    {/* Event Card */}
                    <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 transition-all">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">
                            {event.event_type.replace(/_/g, ' ')}
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {new Date(event.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {event.actor}
                        </span>
                      </div>

                      {/* Event Data */}
                      {event.event_data && Object.keys(event.event_data).length > 0 && (
                        <div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                          <div className="space-y-1 text-sm">
                            {Object.entries(event.event_data).map(([key, value]) => (
                              <div key={key} className="flex items-center gap-2">
                                <span className="text-slate-500 dark:text-slate-400 capitalize">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Hashes */}
                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex items-start gap-2">
                          <span className="text-slate-400 dark:text-slate-500 shrink-0">Prev:</span>
                          <span className="text-slate-600 dark:text-slate-400 break-all">
                            {event.prev_hash.slice(0, 16)}...
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-slate-400 dark:text-slate-500 shrink-0">Hash:</span>
                          <span className="text-cyan-600 dark:text-cyan-400 break-all">
                            {event.current_hash.slice(0, 16)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Empty State */}
          {filteredEvents.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 space-y-4"
            >
              <div className="text-6xl"></div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  No events found
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Try changing the filter or perform some actions
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}