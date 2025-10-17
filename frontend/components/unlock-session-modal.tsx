'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import { toast } from 'sonner';

interface UnlockSessionModalProps {
  onUnlock?: () => void;
}

export function UnlockSessionModal({ onUnlock }: UnlockSessionModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const { getToken } = useAuth();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passphrase.length < 20) {
      toast.error('Passphrase must be at least 20 characters');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error('Authentication failed. Please sign in again.');
        return;
      }

      // Call backend to unlock session
      const response = await api.unlockSession(passphrase);
      
      toast.success('Session unlocked! All projects are now accessible.');
      
      // Store unlock status in sessionStorage (not localStorage!)
      sessionStorage.setItem('cc_unlocked', 'true');
      sessionStorage.setItem('cc_session_id', response.session_id);
      
      // Call onUnlock callback if provided
      if (onUnlock) {
        onUnlock();
      } else {
        // Default: reload page to update UI
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Unlock failed:', error);
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        toast.error('Authentication expired. Please sign in again.');
      } else if (error.response?.status === 400) {
        toast.error('Invalid passphrase. Please check and try again.');
      } else {
        toast.error(`Failed to unlock session: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassphrase = () => {
    toast.info('Recovery phrase support coming soon! Please contact support if you\'ve lost your passphrase.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-md w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Unlock ContextCache
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter your master passphrase to access your projects.
            <br />
            <span className="text-xs">You only need to do this once per session.</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label
              htmlFor="passphrase"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Master Passphrase
            </label>
            <div className="relative">
              <input
                id="passphrase"
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your master passphrase"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus
                disabled={loading}
                minLength={20}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                tabIndex={-1}
              >
                {showPassphrase ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Minimum 20 characters. This passphrase encrypts all your data.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || passphrase.length < 20}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Unlocking...
              </>
            ) : (
              'Unlock Session'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center space-y-2">
          <button
            onClick={handleForgotPassphrase}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Forgot your passphrase?
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your passphrase never leaves your device and is never stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}

