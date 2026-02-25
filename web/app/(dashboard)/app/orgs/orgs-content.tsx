'use client';

import { useEffect, useState } from 'react';
import { orgs, type Org, ApiError } from '@/lib/api';
import { ORG_ID_KEY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { Building2, Check, Save } from 'lucide-react';

export function OrgsContent() {
  const { toast } = useToast();
  const [orgList, setOrgList] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ORG_ID_KEY);
    if (stored) setActiveOrgId(Number(stored));
    loadOrgs();
  }, []);

  async function loadOrgs() {
    try {
      const data = await orgs.list();
      setOrgList(data);
    } catch {
      toast('error', 'Failed to load organisations');
    } finally {
      setLoading(false);
    }
  }

  function selectOrg(org: Org) {
    setActiveOrgId(org.id);
    localStorage.setItem(ORG_ID_KEY, String(org.id));
    toast('success', `Switched to ${org.name}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrg) return;
    setSaving(true);
    try {
      const updated = await orgs.update(editingOrg.id, { name: editName });
      setOrgList((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setEditingOrg(null);
      toast('success', 'Organisation updated');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Organisation</h1>
        <p className="mt-1 text-sm text-ink-2">
          Manage your organisations and switch between them.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : orgList.length === 0 ? (
        <Card className="py-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-sm text-ink-2">No organisations found.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgList.map((org) => (
            <Card key={org.id} hover className="relative">
              {editingOrg?.id === org.id ? (
                <form onSubmit={handleSave} className="space-y-3">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={saving}>
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingOrg(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{org.name}</h3>
                    {activeOrgId === org.id && (
                      <Badge variant="ok">Active</Badge>
                    )}
                  </div>
                  <p className="mb-3 font-mono text-xs text-muted">{org.slug}</p>
                  <div className="flex gap-2">
                    {activeOrgId !== org.id && (
                      <Button size="sm" variant="secondary" onClick={() => selectOrg(org)}>
                        <Check className="h-4 w-4" />
                        Switch
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingOrg(org); setEditName(org.name); }}
                    >
                      Edit
                    </Button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
