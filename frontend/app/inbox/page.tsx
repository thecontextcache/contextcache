'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function InboxPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();

  const [dragActive, setDragActive] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Document loading state
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Load documents from backend
  const loadDocuments = async () => {
    if (!currentProject) {

      return;
    }

    setLoadingDocs(true);
    try {
      const docs = await api.listDocuments(currentProject.id);

      setDocuments(docs);
    } catch (err) {
      console.error(' Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [currentProject]);

  // Handle ingestion (upload or URL)
  const handleIngest = async (fileToUpload?: File) => {

    if (!currentProject) {
      toast.error('No project selected!');
      return;
    }

    const file = fileToUpload || selectedFile;

    if (!file && !url) {
      toast.error('Please select a file or enter a URL');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      console.log(' Uploading to API...', {
        projectId: currentProject.id,
        file: file?.name,
        url,
      });

      await api.ingestDocument(currentProject.id, file || undefined, url || undefined);

      toast.success('Document ingested successfully!', {
        description: file ? file.name : url,
        duration: 3000,
      });

      // Reset form
      setSelectedFile(null);
      setUrl('');
      setFileInputKey(Date.now());

      // Reload documents
      await loadDocuments();
    } catch (err) {
      console.error(' Failed to ingest document:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to ingest document';
      setError(errorMessage);
      toast.error('Upload failed', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setUploading(false);
    }
  };

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle file drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];

        setSelectedFile(file);
        await handleIngest(file); // Pass file directly
      }
    },
    [currentProject]
  );

  // Handle file input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {

      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle URL submit
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    await handleIngest();
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Inbox
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Import documents to {currentProject.name}
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
        <div className="max-w-4xl mx-auto space-y-8">
          {/* URL Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Import from URL
            </h2>
            <form onSubmit={handleUrlSubmit} className="flex gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/document.pdf"
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                disabled={uploading}
              />
              <button
                type="submit"
                disabled={uploading || !url}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {uploading ? 'Fetching...' : 'Import'}
              </button>
            </form>

            {/* Error display */}
            {error && (
              <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </motion.div>

          {/* File Upload */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Upload Files
            </h2>

            {/*  Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                dragActive
                  ? 'border-cyan-500 bg-cyan-500/5'
                  : 'border-slate-300 dark:border-slate-600 hover:border-cyan-500/50'
              }`}
            >
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-2xl flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-cyan-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-medium text-slate-900 dark:text-white">
                    {dragActive ? 'Drop file here' : 'Drag & drop a file here'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    or click below to browse
                  </p>
                </div>

                {/* File Browse Button - Separated */}
                <div className="pt-4">
                  <label className="inline-block cursor-pointer px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium">
                     Choose File
                    <input
                      key={fileInputKey}
                      type="file"
                      onChange={handleChange}
                      accept=".pdf,.txt,.doc,.docx"
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Selected File & Upload Button - OUTSIDE drop zone */}
            {selectedFile && (
              <div className="mt-6 p-6 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border-2 border-cyan-200 dark:border-cyan-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl"></span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileInputKey(Date.now());
                    }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleIngest()}
                  disabled={uploading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20"
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Uploading...
                    </span>
                  ) : (
                    ' Upload File to Project'
                  )}
                </button>
              </div>
            )}
          </motion.div>

          {/* Uploaded Documents List */}
          {documents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Uploaded Documents ({documents.length})
              </h2>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {doc.source_url || doc.name || 'Untitled'}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Type: {doc.source_type} • Status: {doc.status}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Loading State */}
          {(uploading || loadingDocs) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-xl space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full mx-auto"
                />
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  {uploading ? 'Processing document...' : 'Loading documents...'}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
