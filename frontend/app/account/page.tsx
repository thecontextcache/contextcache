'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { 
  User, CreditCard, BarChart3, Shield, Key, 
  Save, Eye, EyeOff, AlertCircle, CheckCircle,
  TrendingUp, FileText, Database, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

interface UsageStats {
  tier: string;
  documents: { used: number; limit: number; percentage: number };
  facts: { used: number; limit: number; percentage: number };
  queries: { used: number; limit: number; percentage: number };
  locked: boolean;
  lock_reason?: string;
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  // Load usage stats
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadUsageStats();
      loadApiKeys();
    }
  }, [isLoaded, isSignedIn]);

  const loadUsageStats = async () => {
    try {
      const response = await api.client.get('/usage/me');
      setUsageStats(response.data.usage);
    } catch (err) {
      console.error('Failed to load usage stats:', err);
      toast.error('Could not load usage statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = () => {
    const stored = localStorage.getItem('ai_api_keys');
    if (stored) {
      try {
        setApiKeys(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load API keys:', e);
      }
    }
  };

  const saveApiKey = (provider: string, key: string) => {
    const updated = { ...apiKeys, [provider]: key };
    setApiKeys(updated);
    localStorage.setItem('ai_api_keys', JSON.stringify(updated));
    toast.success('API key saved securely');
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-gray-600 dark:text-gray-400';
      case 'pro': return 'text-primary dark:text-primary-700';
      case 'enterprise': return 'text-purple-600 dark:text-purple-400';
      default: return 'text-gray-600';
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
      case 'pro': return 'bg-primary/10 dark:bg-primary-700/20 text-primary dark:text-primary-700';
      case 'enterprise': return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-body dark:text-dark-text-muted">Loading account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg-900 py-12 px-4">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-headline dark:text-dark-text-primary mb-2">
            Account Settings
          </h1>
          <p className="text-body dark:text-dark-text-muted">
            Manage your account, usage, and preferences
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Profile & Usage */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface dark:bg-dark-surface-800 rounded-2xl border border-gray-200 dark:border-dark-surface-800 p-6"
            >
              <div className="flex items-center gap-2 mb-6">
                <User className="h-5 w-5 text-primary dark:text-primary-700" />
                <h2 className="text-xl font-semibold text-headline dark:text-dark-text-primary">
                  Profile
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-body dark:text-dark-text-muted">Email</label>
                  <p className="text-headline dark:text-dark-text-primary font-medium">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>

                {usageStats && (
                  <div>
                    <label className="text-sm text-body dark:text-dark-text-muted">Plan</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getTierBadge(usageStats.tier)}`}>
                        {usageStats.tier.toUpperCase()}
                      </span>
                      {usageStats.tier === 'free' && (
                        <button
                          onClick={() => router.push('/pricing')}
                          className="text-sm text-primary hover:underline"
                        >
                          Upgrade to Pro
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {usageStats?.locked && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900 dark:text-red-100">Account Locked</p>
                      <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                        {usageStats.lock_reason || 'Please contact support.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Usage Stats */}
            {usageStats && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-surface dark:bg-dark-surface-800 rounded-2xl border border-gray-200 dark:border-dark-surface-800 p-6"
              >
                <div className="flex items-center gap-2 mb-6">
                  <BarChart3 className="h-5 w-5 text-primary dark:text-primary-700" />
                  <h2 className="text-xl font-semibold text-headline dark:text-dark-text-primary">
                    Usage This Month
                  </h2>
                </div>

                <div className="space-y-6">
                  {/* Documents */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-body dark:text-dark-text-muted" />
                        <span className="text-sm font-medium text-body dark:text-dark-text-muted">Documents</span>
                      </div>
                      <span className="text-sm font-semibold text-headline dark:text-dark-text-primary">
                        {usageStats.documents.used.toLocaleString()} / {usageStats.documents.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(usageStats.documents.percentage)}`}
                        style={{ width: `${Math.min(usageStats.documents.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-body dark:text-dark-text-muted mt-1">
                      {usageStats.documents.percentage.toFixed(1)}% used
                    </p>
                  </div>

                  {/* Facts */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-body dark:text-dark-text-muted" />
                        <span className="text-sm font-medium text-body dark:text-dark-text-muted">Facts Extracted</span>
                      </div>
                      <span className="text-sm font-semibold text-headline dark:text-dark-text-primary">
                        {usageStats.facts.used.toLocaleString()} / {usageStats.facts.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(usageStats.facts.percentage)}`}
                        style={{ width: `${Math.min(usageStats.facts.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-body dark:text-dark-text-muted mt-1">
                      {usageStats.facts.percentage.toFixed(1)}% used
                    </p>
                  </div>

                  {/* Queries */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-body dark:text-dark-text-muted" />
                        <span className="text-sm font-medium text-body dark:text-dark-text-muted">Queries</span>
                      </div>
                      <span className="text-sm font-semibold text-headline dark:text-dark-text-primary">
                        {usageStats.queries.used.toLocaleString()} / {usageStats.queries.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(usageStats.queries.percentage)}`}
                        style={{ width: `${Math.min(usageStats.queries.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-body dark:text-dark-text-muted mt-1">
                      {usageStats.queries.percentage.toFixed(1)}% used
                    </p>
                  </div>
                </div>

                {(usageStats.documents.percentage > 80 || usageStats.facts.percentage > 80 || usageStats.queries.percentage > 80) && (
                  <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ You're approaching your usage limits. Consider upgrading to Pro for unlimited access.
                    </p>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="mt-2 text-sm font-semibold text-primary hover:underline"
                    >
                      View Plans →
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Right Column: Quick Actions */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-surface dark:bg-dark-surface-800 rounded-2xl border border-gray-200 dark:border-dark-surface-800 p-6"
            >
              <h3 className="text-lg font-semibold text-headline dark:text-dark-text-primary mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-dark-bg-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <p className="text-sm font-medium text-headline dark:text-dark-text-primary">Dashboard</p>
                  <p className="text-xs text-body dark:text-dark-text-muted">View your projects</p>
                </button>
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-dark-bg-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <p className="text-sm font-medium text-headline dark:text-dark-text-primary">Upgrade Plan</p>
                  <p className="text-xs text-body dark:text-dark-text-muted">Get unlimited access</p>
                </button>
                <a
                  href="mailto:support@thecontextcache.com"
                  className="block w-full text-left px-4 py-3 bg-gray-50 dark:bg-dark-bg-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <p className="text-sm font-medium text-headline dark:text-dark-text-primary">Contact Support</p>
                  <p className="text-xs text-body dark:text-dark-text-muted">Get help from our team</p>
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

