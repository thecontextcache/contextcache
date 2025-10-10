'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import api  from '@/lib/api';
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
    if (!name || !passphrase) {
      setError('Please fill in all fields');
      return;
    }

    if (passphrase.length < 20) {
      setError('Passphrase must be at least 20 characters');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    setCreating(true);

    try {
      console.log('🔧 Creating project:', name);
      
      // Step 1: Create project on server (gets salt back)
      const response = await api.createProject(name, passphrase);
      
      console.log('✅ Project created:', response);
      console.log('🔑 Salt received:', response.salt);
      
      // Step 2: Derive encryption key from passphrase + salt
      console.log('🔐 Deriving encryption key...');
      const encryptionKey = await deriveKey(passphrase, response.salt!);
      console.log('✅ Encryption key derived and stored in memory');
      
      // Step 3: Store project metadata (with salt) in localStorage
      const newProject = {
        id: response.id,
        name: response.name,
        salt: response.salt,  // ✅ Save salt for future key derivation
        fact_count: 0,
        entity_count: 0,
        created_at: response.created_at,
        updated_at: response.updated_at,
      };
      
      addProject(newProject);
      setCurrentProject(newProject);
      
      // Step 4: Store encryption key in memory (NOT localStorage!)
      setEncryptionKey(response.id, encryptionKey);
      
      console.log('🎉 Project ready! Salt saved, key in memory.');
      
      toast.success('Project created successfully!', {
        description: `"${newProject.name}" is ready to use`,
        duration: 3000,
      });
      
      router.push('/inbox');
    } catch (err: any) {
      console.error('❌ Failed to create project:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create project. Please try again.';
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
              />
            </div>

            {/* Passphrase */}
            <div className="p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Passphrase (min 20 characters)
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

              <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">⚠️</span>
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
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={creating || !name || passphrase.length < 20 || passphrase !== confirmPassphrase}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {creating ? 'Creating Project...' : 'Create Project'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}