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
        errorMessage = 'Network error. Please check your connection and try again.';
        console.error('No response from server. Check backend configuration.');
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
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-dark-surface-800 bg-surface/50 dark:bg-dark-surface-800/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-body dark:text-dark-text-muted hover:text-headline dark:hover:text-dark-text-primary transition-colors"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-headline dark:text-dark-text-primary tracking-tight">
                Create New Project
              </h1>
              <p className="text-body dark:text-dark-text-muted mt-2">
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
            <div className="p-8 rounded-2xl bg-surface dark:bg-dark-surface-800 backdrop-blur-sm border border-gray-200 dark:border-dark-surface-800">
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-3">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Research Project"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-surface dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary focus:border-transparent transition-all"
                disabled={creating}
                autoFocus
              />
            </div>

            {/* Passphrase */}
            <div className="p-8 rounded-2xl bg-surface dark:bg-dark-surface-800 backdrop-blur-sm border border-gray-200 dark:border-dark-surface-800">
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-3">
                Passphrase (minimum 20 characters)
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter a strong passphrase..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-surface dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary focus:border-transparent transition-all mb-4"
                disabled={creating}
              />
              
              <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-3">
                Confirm Passphrase
              </label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Confirm your passphrase..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-surface dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary focus:border-transparent transition-all"
                disabled={creating}
              />

              {/* Security Warning */}
              <div className="mt-4 p-4 rounded-xl bg-warning/10 dark:bg-warning/20 border border-warning/30">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/20 dark:bg-warning/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">⚠️</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-warning-dark dark:text-warning mb-1">
                      Zero-Knowledge Security
                    </p>
                    <p className="text-sm text-warning-dark dark:text-warning/80 leading-relaxed">
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
                className="p-4 rounded-xl bg-error/10 dark:bg-error/20 border border-error/30"
              >
                <div className="flex items-start gap-3">
                  <span className="text-error text-lg">❌</span>
                  <p className="text-sm text-error dark:text-error/90 flex-1">{error}</p>
                </div>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={creating || !name.trim() || passphrase.length < 20 || passphrase !== confirmPassphrase}
              className="w-full py-4 bg-gradient-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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