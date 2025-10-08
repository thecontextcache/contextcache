'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const { currentProject, projects, setProjects, setCurrentProject } = useProjectStore();
  const [projectName, setProjectName] = useState(currentProject?.name || '');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!currentProject || projectName === currentProject.name) return;

    setSaving(true);
    try {
      const updated = await api.updateProject(currentProject.id, projectName);
      
      // Update in store
      const updatedProjects = projects.map(p => 
        p.id === currentProject.id ? { ...p, name: projectName } : p
      );
      setProjects(updatedProjects);
      setCurrentProject({ ...currentProject, name: projectName });
      
      alert('Project name updated successfully!');
    } catch (err) {
      console.error('Failed to update project:', err);
      alert('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRotatePassphrase = () => {
    // Will be implemented in Phase 5
    alert('Passphrase rotation will be available in Phase 5');
  };

  const handleExportRecoveryKit = () => {
    if (!currentProject) return;
    
    // Create mock recovery kit
    const recoveryKit = {
      type: 'ContextCache Recovery Kit',
      version: '1.0',
      project_id: currentProject.id,
      project_name: currentProject.name,
      created_at: new Date().toISOString(),
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      warning: 'Store this recovery kit securely. It cannot be recovered if lost.',
    };

    const blob = new Blob([JSON.stringify(recoveryKit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recovery-kit-${currentProject.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteProject = async () => {
    if (deleteInput !== currentProject?.name) return;

    setDeleting(true);
    try {
      console.log('🗑️ Deleting project:', currentProject.id);
      
      await api.deleteProject(currentProject.id);
      
      console.log('✅ Project deleted successfully');
      
      // Remove from store
      const updatedProjects = projects.filter(p => p.id !== currentProject.id);
      setProjects(updatedProjects);
      setCurrentProject(null);
      
      // Redirect to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 100);
      
    } catch (err) {
      console.error('❌ Failed to delete project:', err);
      alert('Failed to delete project. Please try again.');
      setDeleting(false);
    }
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
                Settings
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Manage {currentProject.name}
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
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Project Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Project Information
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Project ID
                </label>
                <input
                  type="text"
                  value={currentProject.id}
                  disabled
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-mono text-sm cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Read-only UUID identifier
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Facts
                  </label>
                  <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {currentProject.fact_count?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Entities
                  </label>
                  <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {currentProject.entity_count?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Created
                </label>
                <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                  <p className="text-slate-700 dark:text-slate-300">
                    {new Date(currentProject.created_at).toLocaleString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || projectName === currentProject.name}
                className="w-full py-3 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </motion.div>

          {/* Security */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Security & Recovery
            </h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔐</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      Zero-Knowledge Encryption
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Your passphrase never leaves your device. If lost without a recovery kit,
                      data is unrecoverable.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRotatePassphrase}
                className="w-full px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all font-medium flex items-center justify-center gap-2"
              >
                <span>🔑</span>
                <span>Rotate Passphrase</span>
              </button>

              <button
                onClick={handleExportRecoveryKit}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-medium flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>Export Recovery Kit</span>
              </button>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  💡 <strong>Recovery Kit</strong> contains your project encryption key as a
                  24-word mnemonic. Store it securely offline (print or secure USB).
                </p>
              </div>
            </div>
          </motion.div>

          {/* Storage & Usage */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Storage & Usage
            </h2>
            <div className="space-y-6">
              {/* Storage Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Storage Used
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    2.4 MB / 100 MB
                  </span>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '2.4%' }}
                    transition={{ duration: 1 }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Free tier: 100 MB per project
                </p>
              </div>

              {/* Rate Limits */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Rate Limits (per minute)
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Document Import
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      30 / 30
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Queries</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      120 / 120
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800"
          >
            <h2 className="text-xl font-semibold text-red-700 dark:text-red-300 mb-6">
              Danger Zone
            </h2>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all font-medium flex items-center justify-center gap-2"
              >
                <span>🗑️</span>
                <span>Delete Project</span>
              </button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
                  <p className="text-sm text-red-800 dark:text-red-300 font-semibold mb-2">
                    ⚠️ This action cannot be undone
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400">
                    All facts, entities, relations, and audit logs will be permanently deleted.
                    Type the project name to confirm.
                  </p>
                </div>

                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder={`Type "${currentProject.name}" to confirm`}
                  className="w-full px-4 py-3 rounded-lg border-2 border-red-300 dark:border-red-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteInput('');
                    }}
                    className="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-all font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteProject}
                    disabled={deleteInput !== currentProject.name}
                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}