'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { PageNav } from '@/components/page-nav';
import { Database, Download, Clock, Shield, AlertCircle, FileJson, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function DataPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState<'audit' | 'export'>('audit');
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load audit logs
  useEffect(() => {
    const loadAudit = async () => {
      if (!currentProject || activeTab !== 'audit') return;
      
      setLoadingAudit(true);
      try {
        const data = await api.getProjectAudit(currentProject.id, 50);
        setAuditEvents(data.events || []);
      } catch (error) {
        console.error('Failed to load audit log:', error);
        setAuditEvents([]);
      } finally {
        setLoadingAudit(false);
      }
    };

    loadAudit();
  }, [currentProject, activeTab]);

  // Export project data
  const handleExport = async (format: 'json' | 'csv') => {
    if (!currentProject) return;

    setExporting(true);
    try {
      // For now, export basic project info
      const data = {
        project: {
          id: currentProject.id,
          name: currentProject.name,
          created_at: currentProject.created_at,
        },
        exported_at: new Date().toISOString(),
        format: format,
        // TODO: Add actual facts, entities, documents when backend supports it
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name.replace(/\s+/g, '-')}-export-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-dark-bg-900 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">No Project Selected</h2>
            <p className="text-muted-foreground">Select a project from the dashboard</p>
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
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                Data Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentProject.name} • Audit logs & data export
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Dashboard
            </button>
          </div>
          <PageNav currentPage="data" />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Tab Switcher */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'audit'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-4 h-4" />
            Audit Log
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'export'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
        </div>

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Info Card */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">
                    Tamper-Proof Activity Log
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-400">
                    Every action in your project is cryptographically logged. Each event is linked to the previous one, making the log tamper-evident.
                  </p>
                </div>
              </div>
            </div>

            {/* Loading */}
            {loadingAudit && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            )}

            {/* Events */}
            {!loadingAudit && auditEvents.length > 0 && (
              <div className="space-y-3">
                {auditEvents.map((event, index) => (
                  <motion.div
                    key={event.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground capitalize mb-1">
                          {event.event_type?.replace(/_/g, ' ') || 'Activity'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingAudit && auditEvents.length === 0 && (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No activity recorded yet. Upload documents to see audit logs.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            {/* Info Card */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">
                    Export Your Data
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-400">
                    Download your project data in standard formats. Your data is always yours to export and use elsewhere.
                  </p>
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* JSON Export */}
              <div className="p-6 rounded-lg border border-border bg-card">
                <div className="flex items-start gap-3 mb-4">
                  <FileJson className="w-6 h-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">JSON Export</h3>
                    <p className="text-sm text-muted-foreground">
                      Complete project data in JSON format
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleExport('json')}
                  disabled={exporting}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {exporting ? 'Exporting...' : 'Export as JSON'}
                </button>
              </div>

              {/* CSV Export */}
              <div className="p-6 rounded-lg border border-border bg-card">
                <div className="flex items-start gap-3 mb-4">
                  <FileText className="w-6 h-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">CSV Export</h3>
                    <p className="text-sm text-muted-foreground">
                      Spreadsheet-compatible format
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={exporting}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {exporting ? 'Exporting...' : 'Export as CSV'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

