'use client';

import { useEffect, useState } from 'react';
import { admin, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonTable } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import {
  Users,
  Building2,
  Clock,
  BarChart3,
  Send,
  Shield,
} from 'lucide-react';

type Tab = 'users' | 'orgs' | 'waitlist' | 'usage';

export function AdminContent() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [orgsList, setOrgsList] = useState<Record<string, unknown>[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<Record<string, unknown>[]>([]);
  const [usageData, setUsageData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite dialog
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  async function loadTab(t: Tab) {
    setLoading(true);
    try {
      switch (t) {
        case 'users': {
          const data = await admin.users();
          setUsers(data as Record<string, unknown>[]);
          break;
        }
        case 'orgs': {
          const data = await admin.orgs();
          setOrgsList(data as Record<string, unknown>[]);
          break;
        }
        case 'waitlist': {
          const data = await admin.waitlist();
          setWaitlistEntries(data as Record<string, unknown>[]);
          break;
        }
        case 'usage': {
          const data = await admin.usage();
          setUsageData(data as Record<string, unknown>);
          break;
        }
      }
    } catch {
      toast('error', `Failed to load ${t}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await admin.invite(inviteEmail);
      toast('success', `Invited ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      // Reload waitlist
      if (tab === 'waitlist') loadTab('waitlist');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'orgs', label: 'Orgs', icon: Building2 },
    { key: 'waitlist', label: 'Waitlist', icon: Clock },
    { key: 'usage', label: 'Usage', icon: BarChart3 },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-violet" />
          <h1 className="font-display text-2xl font-bold">Admin</h1>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <Send className="h-4 w-4" />
          Invite user
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-line bg-bg-2 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'bg-panel text-ink shadow-sm'
                  : 'text-muted hover:text-ink-2'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <>
          {tab === 'users' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">ID</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Admin</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted">{String(u.id || i)}</td>
                      <td className="px-4 py-3 text-ink">{String(u.email || '')}</td>
                      <td className="px-4 py-3">
                        {u.is_admin ? (
                          <Badge variant="violet">Admin</Badge>
                        ) : (
                          <Badge variant="muted">User</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {u.created_at ? new Date(String(u.created_at)).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No users</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'orgs' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">ID</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Name</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Slug</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsList.map((o, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted">{String(o.id || i)}</td>
                      <td className="px-4 py-3 text-ink">{String(o.name || '')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{String(o.slug || '')}</td>
                      <td className="px-4 py-3 text-muted">
                        {o.created_at ? new Date(String(o.created_at)).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {orgsList.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No organisations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'waitlist' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Name</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Company</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistEntries.map((w, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{String(w.email || '')}</td>
                      <td className="px-4 py-3 text-ink-2">{String(w.name || '—')}</td>
                      <td className="px-4 py-3 text-ink-2">{String(w.company || '—')}</td>
                      <td className="px-4 py-3 text-muted">
                        {w.created_at ? new Date(String(w.created_at)).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {waitlistEntries.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No waitlist entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'usage' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {usageData ? (
                Object.entries(usageData).map(([key, val]) => (
                  <Card key={key}>
                    <p className="text-xs text-muted uppercase tracking-wider">{key.replace(/_/g, ' ')}</p>
                    <p className="mt-1 font-display text-2xl font-bold gradient-text">
                      {typeof val === 'number' ? val.toLocaleString() : String(val)}
                    </p>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full py-8 text-center">
                  <p className="text-muted">No usage data available</p>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={showInvite} onClose={() => setShowInvite(false)} title="Invite User">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
            <Input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@company.com"
            />
          </div>
          <Button type="submit" loading={inviting} className="w-full">
            Send invite
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
