'use client';

import { useEffect, useState } from 'react';
import { apiKeys, type ApiKey, type ApiKeyCreated, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonTable } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { Plus, Trash2, Copy, Check, Key, AlertTriangle } from 'lucide-react';

export function ApiKeysContent() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const data = await apiKeys.list();
      setKeys(data);
    } catch {
      toast('error', 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiKeys.create(label);
      setNewKey(created);
      setKeys((prev) => [...prev, created]);
      setLabel('');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    try {
      await apiKeys.revoke(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast('success', 'API key revoked');
    } catch {
      toast('error', 'Failed to revoke key');
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">API Keys</h1>
        <Button size="sm" onClick={() => { setShowCreate(true); setNewKey(null); }}>
          <Plus className="h-4 w-4" />
          Create key
        </Button>
      </div>

      {loading ? (
        <SkeletonTable rows={3} />
      ) : keys.length === 0 ? (
        <Card className="py-12 text-center">
          <Key className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="mb-4 text-sm text-ink-2">No API keys yet. Create one to get started.</p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create key
          </Button>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-bg-2 text-left">
                <th className="px-4 py-3 font-medium text-ink-2">Label</th>
                <th className="px-4 py-3 font-medium text-ink-2">Prefix</th>
                <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                <th className="px-4 py-3 font-medium text-ink-2">Last used</th>
                <th className="px-4 py-3 font-medium text-ink-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{k.label}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-bg-2 px-2 py-1 font-mono text-xs text-ink-2">{k.prefix}...</code>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="rounded p-1.5 text-muted transition-colors hover:bg-err/10 hover:text-err"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={() => { setShowCreate(false); setNewKey(null); }}
        title={newKey ? 'API Key Created' : 'Create API Key'}
      >
        {newKey ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-warn/20 bg-warn/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <p className="text-sm text-warn">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-2 px-4 py-3 font-mono text-sm">
              <code className="flex-1 break-all text-ok">{newKey.key}</code>
              <button
                onClick={() => handleCopy(newKey.key)}
                className="shrink-0 rounded p-1 text-muted hover:text-ink"
              >
                {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => { setShowCreate(false); setNewKey(null); }}
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Label</label>
              <Input
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI/CD pipeline"
              />
            </div>
            <Button type="submit" loading={creating} className="w-full">
              Create key
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
