'use client';

import { useEffect, useState } from 'react';
import { orgs, type OrgMember, type AuditLog, ApiError } from '@/lib/api';
import { ORG_ID_KEY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonCard, SkeletonTable } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import {
  Building2,
  Check,
  Save,
  Plus,
  Trash2,
  Users,
  ScrollText,
  UserPlus,
} from 'lucide-react';

type OrgListItem = { id: number; name: string; role: string | null };
type Tab = 'orgs' | 'members' | 'audit';

export function OrgsContent() {
  const { toast } = useToast();
  const [orgList, setOrgList] = useState<OrgListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [editingOrg, setEditingOrg] = useState<OrgListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Create org
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<OrgListItem | null>(null);

  // Tabs for active org detail
  const [tab, setTab] = useState<Tab>('orgs');

  // Members
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ORG_ID_KEY);
    if (stored) setActiveOrgId(Number(stored));
    loadOrgs();
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    if (tab === 'members') loadMembers(activeOrgId);
    if (tab === 'audit') loadAuditLogs(activeOrgId);
  }, [tab, activeOrgId]);

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

  async function loadMembers(orgId: number) {
    setMembersLoading(true);
    try {
      const data = await orgs.members(orgId);
      setMembers(data);
    } catch {
      toast('error', 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadAuditLogs(orgId: number) {
    setAuditLoading(true);
    try {
      const data = await orgs.auditLogs(orgId);
      setAuditLogs(data);
    } catch {
      toast('error', 'Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  }

  function selectOrg(org: OrgListItem) {
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
      setOrgList((prev) => prev.map((o) => (o.id === updated.id ? { ...o, name: updated.name } : o)));
      setEditingOrg(null);
      toast('success', 'Organisation updated');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreatingOrg(true);
    try {
      const created = await orgs.create(newOrgName);
      setOrgList((prev) => [...prev, { id: created.id, name: created.name, role: 'owner' }]);
      setShowCreate(false);
      setNewOrgName('');
      selectOrg({ id: created.id, name: created.name, role: 'owner' });
      toast('success', `Organisation "${created.name}" created`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to create');
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleDeleteOrg() {
    if (!deleteTarget) return;
    try {
      await orgs.delete(deleteTarget.id);
      setOrgList((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      if (activeOrgId === deleteTarget.id) {
        setActiveOrgId(null);
        localStorage.removeItem(ORG_ID_KEY);
      }
      setDeleteTarget(null);
      toast('success', 'Organisation deleted');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to delete');
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setAddingMember(true);
    try {
      const m = await orgs.addMember(activeOrgId, { email: memberEmail, role: memberRole });
      setMembers((prev) => [...prev, m]);
      setShowAddMember(false);
      setMemberEmail('');
      setMemberRole('member');
      toast('success', `Added ${m.email}`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  const activeOrg = orgList.find((o) => o.id === activeOrgId);

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: 'orgs', label: 'Organisations', icon: Building2 },
    { key: 'members', label: 'Members', icon: Users },
    { key: 'audit', label: 'Audit Log', icon: ScrollText },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Organisation</h1>
          <p className="mt-1 text-sm text-ink-2">
            Manage your organisations, members, and audit logs.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New org
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-line bg-bg-2 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const disabled = t.key !== 'orgs' && !activeOrgId;
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setTab(t.key)}
              disabled={disabled}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'bg-panel text-ink shadow-sm'
                  : disabled
                    ? 'cursor-not-allowed text-muted/50'
                    : 'text-muted hover:text-ink-2'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Orgs tab */}
      {tab === 'orgs' && (
        <>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : orgList.length === 0 ? (
            <Card className="py-12 text-center">
              <Building2 className="mx-auto mb-3 h-10 w-10 text-muted" />
              <p className="mb-4 text-sm text-ink-2">No organisations found.</p>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Create one
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {orgList.map((org) => (
                <Card key={org.id} hover className="group relative">
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
                        {org.role && (
                          <Badge variant="muted">{org.role}</Badge>
                        )}
                      </div>
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
                        <button
                          onClick={() => setDeleteTarget(org)}
                          className="rounded p-1.5 text-muted opacity-0 transition-all hover:bg-err/10 hover:text-err group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Members tab */}
      {tab === 'members' && activeOrgId && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Members of {activeOrg?.name ?? 'Org'}
            </h2>
            <Button size="sm" onClick={() => setShowAddMember(true)}>
              <UserPlus className="h-4 w-4" />
              Add member
            </Button>
          </div>

          {membersLoading ? (
            <SkeletonTable rows={3} />
          ) : members.length === 0 ? (
            <Card className="py-8 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-muted" />
              <p className="text-sm text-ink-2">No members yet.</p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Display name</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Role</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{m.email}</td>
                      <td className="px-4 py-3 text-ink-2">{m.display_name || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={m.role === 'owner' ? 'violet' : 'muted'}>{m.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Dialog open={showAddMember} onClose={() => setShowAddMember(false)} title="Add member">
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
                <Input
                  required
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="teammate@company.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <Button type="submit" loading={addingMember} className="w-full">
                Add member
              </Button>
            </form>
          </Dialog>
        </div>
      )}

      {/* Audit log tab */}
      {tab === 'audit' && activeOrgId && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">
            Audit log for {activeOrg?.name ?? 'Org'}
          </h2>
          {auditLoading ? (
            <SkeletonTable rows={5} />
          ) : auditLogs.length === 0 ? (
            <Card className="py-8 text-center">
              <ScrollText className="mx-auto mb-3 h-8 w-8 text-muted" />
              <p className="text-sm text-ink-2">No audit log entries.</p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Action</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Entity</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Actor</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <Badge variant="muted">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {log.entity_type} #{log.entity_id}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {log.actor_user_id ? `User #${log.actor_user_id}` : log.api_key_prefix ? `Key ${log.api_key_prefix}...` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create org dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Create organisation">
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <Input
              required
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. Acme Corp"
            />
          </div>
          <Button type="submit" loading={creatingOrg} className="w-full">
            Create organisation
          </Button>
        </form>
      </Dialog>

      {/* Delete org confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete organisation"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Are you sure you want to delete <strong className="text-ink">{deleteTarget?.name}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-err text-white hover:bg-err/90"
              onClick={handleDeleteOrg}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
