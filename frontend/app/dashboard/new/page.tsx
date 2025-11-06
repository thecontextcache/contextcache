'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { useProjectStore } from '@/lib/store/project';
import { deriveKey } from '@/lib/crypto';
import { toast } from 'sonner';

export default function NewProjectPage() {
  const router = useRouter();
  const { addProject, setCurrentProject, setEncryptionKey } = useProjectStore();
  
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Project name is required');
      toast.error('Project name is required');
      return;
    }

    if (!passphrase) {
      setError('Passphrase is required');
      toast.error('Passphrase is required');
      return;
    }

    if (passphrase.length < 20) {
      setError('Passphrase must be at least 20 characters');
      toast.error('Passphrase must be at least 20 characters');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      toast.error('Passphrases do not match');
      return;
    }

    setCreating(true);

    try {

      //  FIX: Use the createProject method from api (not api.client.post directly)
      const projectData = await api.createProject(name.trim(), passphrase);


      // Step 2: Derive encryption key from passphrase + salt

      const encryptionKey = await deriveKey(passphrase, projectData.salt);

      // Step 3: Store project metadata (with salt) in localStorage
      const newProject = {
        id: projectData.id,
        name: projectData.name,
        salt: projectData.salt,  //  Save salt for future key derivation
        fact_count: 0,
        entity_count: 0,
        created_at: projectData.created_at || new Date().toISOString(),
        updated_at: projectData.updated_at || new Date().toISOString(),
      };
      
      addProject(newProject);
      setCurrentProject(newProject);
      
      // Step 4: Store encryption key in memory (NOT localStorage!)
      setEncryptionKey(projectData.id, encryptionKey);

      toast.success('Project created successfully!', {
        description: `"${newProject.name}" is ready to use`,
        duration: 3000,
      });
      
      // Small delay to show success toast before redirect
      setTimeout(() => {
        router.push('/inbox');
      }, 500);
      
    } catch (err: any) {
      console.error(' Failed to create project:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        hasRequest: !!err.request,
      });
      
      // Handle different error types
      let errorMessage = 'Failed to create project. Please try again.';
      
      if (err.response) {
        // Server responded with error
        if (err.response.status === 401) {
          errorMessage = 'Authentication required. Please sign in again.';
        } else if (err.response.status === 400) {
          errorMessage = err.response.data?.detail || 'Invalid project data';
        } else if (err.response.status === 409) {
          errorMessage = 'Project name already exists';
        } else if (err.response.data?.detail) {
          errorMessage = err.response.data.detail;
        }
      } else if (err.request) {
        // Network error - no response received
        errorMessage = 'Network error. Is the backend running at http://localhost:8000?';
        console.error('No response from server. Check if backend is running.');
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      toast.error('Failed to create project', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Create New Project
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Secure your knowledge with zero-knowledge encryption
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Project Name */}
            <div className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Research Project"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                disabled={creating}
                autoFocus
              />
            </div>

            {/* Passphrase */}
            <div className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Passphrase (minimum 20 characters)
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter a strong passphrase..."
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all mb-4"
                disabled={creating}
              />
              
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Confirm Passphrase
              </label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Confirm your passphrase..."
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                disabled={creating}
              />

              {/* Security Warning */}
              <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg"></span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Zero-Knowledge Security
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                      Your passphrase never leaves your device. If you lose it, your data cannot be recovered. Consider storing it in a password manager.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              >
                <div className="flex items-start gap-3">
                  <span className="text-red-500 text-lg"></span>
                  <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                </div>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={creating || !name.trim() || passphrase.length < 20 || passphrase !== confirmPassphrase}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating Project...
                </span>
              ) : (
                'Create Project'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}