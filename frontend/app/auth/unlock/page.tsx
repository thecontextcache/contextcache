'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Lock, Key, Download } from 'lucide-react';

export default function UnlockPage() {
  const router = useRouter();
  const [masterKey, setMasterKey] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!masterKey.trim()) {
      setError('Master key is required');
      toast.error('Master key is required');
      return;
    }

    if (masterKey.length < 20) {
      setError('Master key must be at least 20 characters');
      toast.error('Master key must be at least 20 characters');
      return;
    }

    setUnlocking(true);

    try {
      const response = await api.unlockSession(masterKey);
      
      toast.success('Session unlocked successfully!', {
        description: `Valid for ${Math.floor(response.expires_in / 60)} minutes`,
        duration: 3000,
      });

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
      
    } catch (err: any) {
      console.error('Failed to unlock session:', err);
      
      let errorMessage = 'Failed to unlock session';
      
      if (err.response) {
        if (err.response.status === 400) {
          errorMessage = 'Incorrect master key. Please try again.';
        } else if (err.response.data?.detail) {
          errorMessage = err.response.data.detail;
        }
      } else {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setError(errorMessage);
      toast.error('Unlock failed', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setUnlocking(false);
    }
  };

  const downloadMasterKey = () => {
    const blob = new Blob([masterKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contextcache-master-key-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHasDownloaded(true);
    toast.success('Master key downloaded', {
      description: 'Keep this file safe - you cannot recover your data without it!',
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-primary rounded-2xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-headline dark:text-dark-text-primary mb-2">
            Unlock Your Account
          </h1>
          <p className="text-body dark:text-dark-text-muted">
            Enter your master key to access your encrypted data
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock} className="space-y-6">
          <div className="p-8 rounded-2xl bg-surface dark:bg-dark-surface-800 backdrop-blur-sm border border-gray-200 dark:border-dark-surface-800 shadow-lg">
            <label className="block text-sm font-medium text-body dark:text-dark-text-muted mb-3">
              Master Key (minimum 20 characters)
            </label>
            <input
              type="password"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              placeholder="Enter your master key..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-surface-800 bg-background dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted focus:ring-2 focus:ring-secondary-700 dark:focus:ring-secondary focus:border-transparent transition-all"
              disabled={unlocking}
              autoFocus
            />
            {masterKey.length > 0 && masterKey.length < 20 && (
              <p className="text-xs text-warning dark:text-warning mt-2">
                {20 - masterKey.length} more characters needed
              </p>
            )}
          </div>

          {/* Security Info */}
          <div className="p-4 rounded-xl bg-secondary/10 dark:bg-secondary/20 border border-secondary/30">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-secondary-700 dark:text-secondary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-secondary-700 dark:text-secondary mb-1">
                  First Time User?
                </p>
                <p className="text-sm text-body dark:text-dark-text-muted leading-relaxed">
                  Create a strong master key (20+ characters). This encrypts ALL your data. 
                  <strong className="text-warning"> If you lose it, your data cannot be recovered.</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Download Button */}
          {masterKey.length >= 20 && (
            <motion.button
              type="button"
              onClick={downloadMasterKey}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 border rounded-lg transition-all ${
                hasDownloaded
                  ? 'bg-success/10 dark:bg-success/20 border-success/30 text-success'
                  : 'bg-surface dark:bg-dark-surface-800 border-secondary/30 text-secondary-700 dark:text-secondary hover:bg-secondary/10 dark:hover:bg-secondary/20'
              }`}
            >
              <Download className="w-4 h-4" />
              {hasDownloaded ? '✓ Master Key Downloaded' : 'Download Master Key Backup (Required)'}
            </motion.button>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-error/10 dark:bg-error/20 border border-error/30"
            >
              <p className="text-sm text-error dark:text-error/90">{error}</p>
            </motion.div>
          )}

          {/* Reminder if not downloaded */}
          {masterKey.length >= 20 && !hasDownloaded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-info/10 dark:bg-info/20 border border-info/30"
            >
              <p className="text-sm text-info dark:text-info/90 font-medium">
                💡 Tip: Download your master key backup for safekeeping
              </p>
            </motion.div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={unlocking || masterKey.length < 20}
            className="w-full py-4 bg-gradient-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {unlocking ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Unlocking...
              </span>
            ) : (
              'Unlock & Continue'
            )}
          </button>

          {/* Back Link */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-body dark:text-dark-text-muted hover:text-headline dark:hover:text-dark-text-primary transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

