'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { deriveKey } from '@/lib/crypto';
import type { Project } from '@/lib/types';

interface UnlockProjectModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

export default function UnlockProjectModal({
  project,
  isOpen,
  onClose,
  onUnlock,
}: UnlockProjectModalProps) {
  const { setEncryptionKey } = useProjectStore();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Clear state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPassphrase('');
      setError(null);
      setUnlocking(false);
    }
  }, [isOpen]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passphrase) {
      setError('Please enter your passphrase');
      return;
    }

    if (!project.salt) {
      setError('Project salt not found. Cannot unlock.');
      return;
    }

    setUnlocking(true);

    try {
      console.log('🔐 Unlocking project:', project.name);
      console.log('🔑 Deriving encryption key from passphrase...');

      // Derive encryption key from passphrase + salt
      const encryptionKey = await deriveKey(passphrase, project.salt);

      // Store key in memory
      setEncryptionKey(project.id, encryptionKey);

      console.log('✅ Project unlocked! Key stored in memory.');

      // Success!
      onUnlock();
      onClose();
    } catch (err: any) {
      console.error('❌ Failed to unlock project:', err);
      setError('Incorrect passphrase or key derivation failed.');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🔒</span>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Unlock Project
                  </h2>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  Enter your passphrase to unlock{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {project.name}
                  </span>
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleUnlock} className="space-y-4">
                {/* Passphrase Input */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Passphrase
                  </label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your passphrase..."
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    disabled={unlocking}
                  />
                </div>

                {/* Info Box */}
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    💡 Your passphrase is used to derive the encryption key locally.
                    It never leaves your device.
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  >
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  </motion.div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={unlocking}
                    className="flex-1 py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={unlocking || !passphrase}
                    className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {unlocking ? 'Unlocking...' : 'Unlock'}
                  </button>
                </div>
              </form>

              {/* Forgot Passphrase */}
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Forgot your passphrase?{' '}
                  <a href="#" className="text-cyan-500 hover:text-cyan-600 font-medium">
                    Restore from Recovery Kit
                  </a>
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

