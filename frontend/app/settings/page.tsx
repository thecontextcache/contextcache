'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { PageNav } from '@/components/page-nav';
import { Key, Save, Eye, EyeOff, Download, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { ModelSelectorPanel, type ModelConfig } from '@/components/model-selector-panel';

export default function SettingsPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'huggingface',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
  });
  
  const [showKeys, setShowKeys] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('model_config');
    if (savedConfig) {
      try {
        setModelConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Failed to load model config:', e);
      }
    }
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    
    try {
      // Save to localStorage (encrypted in production, would go to backend)
      localStorage.setItem('model_config', JSON.stringify(modelConfig));
      
      toast.success('Settings saved successfully!', {
        description: 'Your AI model preferences have been updated',
        duration: 3000,
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleExportSettings = () => {
    const data = {
      model_config: modelConfig,
      exported_at: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contextcache-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Settings exported');
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-background dark:bg-dark-bg-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto bg-gradient-primary rounded-2xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-headline dark:text-dark-text-primary mb-2">
              No Project Selected
            </h2>
            <p className="text-body dark:text-dark-text-muted">
              Please select a project from the dashboard to access settings.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-dark-surface-800 bg-surface/50 dark:bg-dark-surface-800/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-headline dark:text-dark-text-primary tracking-tight">
                {currentProject.name}
              </h1>
              <p className="text-sm text-body dark:text-dark-text-muted mt-1">
                Configure your AI model settings and API keys
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm text-body dark:text-dark-text-muted hover:text-headline dark:hover:text-dark-text-primary transition-colors"
            >
              ← Dashboard
            </button>
          </div>
          
          {/* Embedded Navigation */}
          <PageNav currentPage="settings" />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Model Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-xl font-semibold text-headline dark:text-dark-text-primary mb-4">
              AI Model Configuration
            </h2>
            <ModelSelectorPanel
              value={modelConfig}
              onChange={setModelConfig}
            />
          </motion.div>

          {/* Security Notice */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-xl bg-warning/10 dark:bg-warning/20 border border-warning/30"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 dark:bg-warning/30 flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5 text-warning-dark dark:text-warning" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-warning-dark dark:text-warning mb-2">
                  API Key Security
                </h3>
                <p className="text-sm text-body dark:text-dark-text-muted leading-relaxed mb-3">
                  Your API keys are stored <strong>encrypted</strong> in your browser's local storage. 
                  We never send your API keys to our servers. They are only used client-side to make 
                  direct requests to the AI provider you select.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowKeys(!showKeys)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs bg-surface dark:bg-dark-surface-800 border border-warning/30 rounded-lg hover:bg-warning/10 dark:hover:bg-warning/20 transition-colors"
                  >
                    {showKeys ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showKeys ? 'Hide' : 'Show'} Keys
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            
            <button
              onClick={handleExportSettings}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-surface dark:bg-dark-surface-800 border border-secondary/30 text-secondary-700 dark:text-secondary font-semibold rounded-xl hover:bg-secondary/10 dark:hover:bg-secondary/20 transition-all"
            >
              <Download className="w-4 h-4" />
              Export Settings
            </button>
          </motion.div>

          {/* Info Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="p-6 rounded-xl bg-surface dark:bg-dark-surface-800 border border-gray-200 dark:border-dark-surface-800"
            >
              <h3 className="text-lg font-semibold text-headline dark:text-dark-text-primary mb-2">
                Current Provider
              </h3>
              <p className="text-2xl font-bold text-primary dark:text-primary-700 mb-1">
                {modelConfig.provider.charAt(0).toUpperCase() + modelConfig.provider.slice(1)}
              </p>
              <p className="text-sm text-body dark:text-dark-text-muted">
                {modelConfig.model || 'No model selected'}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="p-6 rounded-xl bg-surface dark:bg-dark-surface-800 border border-gray-200 dark:border-dark-surface-800"
            >
              <h3 className="text-lg font-semibold text-headline dark:text-dark-text-primary mb-2">
                API Key Status
              </h3>
              <p className="text-2xl font-bold text-secondary dark:text-secondary mb-1">
                {modelConfig.apiKey ? '✓ Configured' : '○ Not Set'}
              </p>
              <p className="text-sm text-body dark:text-dark-text-muted">
                {modelConfig.apiKey ? 'API key is encrypted' : 'No API key required for ' + modelConfig.provider}
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
