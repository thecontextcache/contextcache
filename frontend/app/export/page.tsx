'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

type ExportFormat = 'json' | 'csv' | 'memory-pack' | 'jsonld';

export default function ExportPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [exportFormat, setExportFormat] = useState<ExportFormat>('memory-pack');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [signatureValid, setSignatureValid] = useState<boolean | null>(null);

  const handleExport = async () => {
    if (!currentProject) return;

    setExporting(true);

    // Simulate export delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    let content = '';
    let filename = '';
    let mimeType = '';

    switch (exportFormat) {
      case 'json':
        content = JSON.stringify(
          {
            project: currentProject.name,
            exported_at: new Date().toISOString(),
            facts: [],
            entities: [],
            relations: [],
          },
          null,
          2
        );
        filename = `${currentProject.name}-export.json`;
        mimeType = 'application/json';
        break;

      case 'csv':
        content = 'subject,predicate,object,context,confidence\n';
        content += 'Marie Curie,discovered,Radium,1898,0.98\n';
        filename = `${currentProject.name}-facts.csv`;
        mimeType = 'text/csv';
        break;

      case 'memory-pack':
        content = JSON.stringify(
          {
            '@context': 'https://thecontextcache.com/schema/v1',
            '@type': 'MemoryPack',
            version: '1.0',
            project_name: currentProject.name,
            created_at: new Date().toISOString(),
            facts: [],
            signature: 'mock-ed25519-signature-base64',
            public_key: 'mock-ed25519-public-key-base64',
          },
          null,
          2
        );
        filename = `${currentProject.name}-memory-pack.json`;
        mimeType = 'application/json';
        break;

      case 'jsonld':
        content = JSON.stringify(
          {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: currentProject.name,
            datePublished: new Date().toISOString(),
            creator: { '@type': 'Person', name: 'ContextCache User' },
            distribution: [],
          },
          null,
          2
        );
        filename = `${currentProject.name}-jsonld.json`;
        mimeType = 'application/ld+json';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setSignatureValid(null);

    // Simulate import and verification
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock verification (always valid for demo)
    setSignatureValid(true);
    setImporting(false);
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
                Export & Import
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Share knowledge from {currentProject.name}
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

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Export Section */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Export</h2>

            {/* Format Selection */}
            <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Choose Format
              </h3>
              <div className="space-y-3">
                {[
                  {
                    id: 'memory-pack',
                    name: 'Memory Pack',
                    desc: 'Signed JSON-LD with Ed25519',
                    icon: '📦',
                    recommended: true,
                  },
                  {
                    id: 'json',
                    name: 'JSON',
                    desc: 'Standard JSON export',
                    icon: '📄',
                  },
                  {
                    id: 'csv',
                    name: 'CSV',
                    desc: 'Spreadsheet compatible',
                    icon: '📊',
                  },
                  {
                    id: 'jsonld',
                    name: 'JSON-LD',
                    desc: 'Semantic web format',
                    icon: '🕸️',
                  },
                ].map((format) => (
                  <button
                    key={format.id}
                    onClick={() => setExportFormat(format.id as ExportFormat)}
                    className={`w-full p-4 rounded-xl text-left transition-all relative ${
                      exportFormat === format.id
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg'
                        : 'bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50'
                    }`}
                  >
                    {format.recommended && exportFormat === format.id && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-medium">
                        Recommended
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{format.icon}</span>
                      <div className="flex-1">
                        <h4
                          className={`font-semibold mb-1 ${
                            exportFormat === format.id
                              ? 'text-white'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {format.name}
                        </h4>
                        <p
                          className={`text-sm ${
                            exportFormat === format.id
                              ? 'text-white/80'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {format.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Options */}
            <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Include
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-cyan-500" />
                  <span className="text-slate-700 dark:text-slate-300">All facts</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-cyan-500" />
                  <span className="text-slate-700 dark:text-slate-300">
                    Entities and relations
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded text-cyan-500" />
                  <span className="text-slate-700 dark:text-slate-300">Provenance data</span>
                </label>
                {exportFormat === 'memory-pack' && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 rounded text-cyan-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      Sign with Ed25519
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 transition-all"
            >
              {exporting ? 'Exporting...' : `📤 Export as ${exportFormat.toUpperCase()}`}
            </button>
          </div>

          {/* Import Section */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Import</h2>

            <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Import Memory Pack
              </h3>
              <form onSubmit={handleImport} className="space-y-6">
                {/* File Input */}
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-cyan-500 transition-colors">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="import-file"
                  />
                  <label htmlFor="import-file" className="cursor-pointer">
                    <div className="text-5xl mb-4">📥</div>
                    <p className="text-slate-900 dark:text-white font-medium mb-1">
                      {importFile ? importFile.name : 'Choose Memory Pack file'}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      .json file with Ed25519 signature
                    </p>
                  </label>
                </div>

                {/* Signature Status */}
                <AnimatePresence>
                  {signatureValid !== null && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`p-4 rounded-xl border ${
                        signatureValid
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{signatureValid ? '✅' : '❌'}</span>
                        <div>
                          <p
                            className={`font-semibold ${
                              signatureValid
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-red-700 dark:text-red-300'
                            }`}
                          >
                            {signatureValid ? 'Signature Valid' : 'Signature Invalid'}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {signatureValid
                              ? 'Memory Pack verified. Safe to import.'
                              : 'Ed25519 verification failed. Do not import.'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Import Button */}
                <button
                  type="submit"
                  disabled={!importFile || importing}
                  className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 transition-all"
                >
                  {importing ? 'Verifying & Importing...' : '📥 Import & Verify'}
                </button>
              </form>
            </div>

            {/* Security Notice */}
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Always Verify Signatures
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Only import Memory Packs from trusted sources. Verify Ed25519 signatures
                    before importing to prevent tampered data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}