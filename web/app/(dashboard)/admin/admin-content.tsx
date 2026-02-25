'use client';

import { useEffect, useState } from 'react';
import {
  admin,
  type AdminUser,
  type AdminInvite,
  type AdminRecallLog,
  type CagCacheStats,
  type AdminUsageRow,
  ApiError,
} from '@/lib/api';
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
  Mail,
  Search,
  Server,
  ChevronDown,
  ChevronRight,
  Ban,
  CheckCircle,
  ShieldCheck,
  ShieldOff,
  LogOut,
  Infinity,
  XCircle,
} from 'lucide-react';

type Tab = 'users' | 'invites' | 'orgs' | 'waitlist' | 'usage' | 'recall' | 'system';

export function AdminContent() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('users');

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [userStats, setUserStats] = useState<Record<string, unknown> | null>(null);
  const [loginEvents, setLoginEvents] = useState<Record<string, unknown>[]>([]);

  // Invites
  const [invites, setInvites] = useState<AdminInvite[]>([]);

  // Orgs
  const [orgsList, setOrgsList] = useState<Record<string, unknown>[]>([]);

  // Waitlist
  const [waitlistEntries, setWaitlistEntries] = useState<Record<string, unknown>[]>([]);

  // Usage
  const [usageData, setUsageData] = useState<AdminUsageRow[]>([]);

  // Recall logs
  const [recallLogs, setRecallLogs] = useState<AdminRecallLog[]>([]);

  // System / CAG
  const [cagStats, setCagStats] = useState<CagCacheStats | null>(null);

  const [loading, setLoading] = useState(true);

  // Invite dialog
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNotes, setInviteNotes] = useState('');
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
          setUsers(data);
          break;
        }
        case 'invites': {
          const data = await admin.invites();
          setInvites(data);
          break;
        }
        case 'orgs': {
          const data = await admin.orgs();
          setOrgsList(data as unknown as Record<string, unknown>[]);
          break;
        }
        case 'waitlist': {
          const data = await admin.waitlist();
          setWaitlistEntries(data as Record<string, unknown>[]);
          break;
        }
        case 'usage': {
          const data = await admin.usage();
          setUsageData(data);
          break;
        }
        case 'recall': {
          const data = await admin.recallLogs();
          setRecallLogs(data);
          break;
        }
        case 'system': {
          try {
            const data = await admin.cagCacheStats();
            setCagStats(data);
          } catch {
            setCagStats(null);
          }
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
      await admin.createInvite(inviteEmail, inviteNotes || undefined);
      toast('success', `Invited ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      setInviteNotes('');
      if (tab === 'invites') loadTab('invites');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  async function toggleExpandUser(userId: number) {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    try {
      const [stats, events] = await Promise.all([
        admin.userStats(userId),
        admin.loginEvents(userId),
      ]);
      setUserStats(stats as unknown as Record<string, unknown>);
      setLoginEvents(events as unknown as Record<string, unknown>[]);
    } catch {
      toast('error', 'Failed to load user details');
    }
  }

  async function userAction(userId: number, action: () => Promise<void>, msg: string) {
    try {
      await action();
      toast('success', msg);
      loadTab('users');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function handleRevokeInvite(id: number) {
    try {
      await admin.revokeInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast('success', 'Invite revoked');
    } catch {
      toast('error', 'Failed to revoke invite');
    }
  }

  async function handleEvaporate() {
    try {
      const data = await admin.cagEvaporate();
      setCagStats(data);
      toast('success', 'Evaporation triggered');
    } catch {
      toast('error', 'Failed to trigger evaporation');
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'invites', label: 'Invites', icon: Mail },
    { key: 'orgs', label: 'Orgs', icon: Building2 },
    { key: 'waitlist', label: 'Waitlist', icon: Clock },
    { key: 'usage', label: 'Usage', icon: BarChart3 },
    { key: 'recall', label: 'Recall Logs', icon: Search },
    { key: 'system', label: 'CAG Cache', icon: Server },
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
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-line bg-bg-2 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'bg-panel text-ink shadow-sm'
                  : 'text-muted hover:text-ink-2'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <>
          {/* ── Users ─────────────────────────────────── */}
          {tab === 'users' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2" />
                    <th className="px-4 py-3 font-medium text-ink-2">ID</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Role</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Status</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Last Login</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <>
                      <tr key={u.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpandUser(u.id)}
                            className="rounded p-1 text-muted hover:text-ink"
                          >
                            {expandedUser === u.id
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted">{u.id}</td>
                        <td className="px-4 py-3 text-ink">{u.email}</td>
                        <td className="px-4 py-3">
                          {u.is_admin ? (
                            <Badge variant="violet">Admin</Badge>
                          ) : (
                            <Badge variant="muted">User</Badge>
                          )}
                          {u.is_unlimited && (
                            <Badge variant="ok" className="ml-1">Unlimited</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.is_disabled ? (
                            <Badge variant="err">Disabled</Badge>
                          ) : (
                            <Badge variant="ok">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {u.is_disabled ? (
                              <button
                                title="Enable"
                                onClick={() => userAction(u.id, () => admin.enableUser(u.id), 'User enabled')}
                                className="rounded p-1 text-muted hover:text-ok"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                title="Disable"
                                onClick={() => userAction(u.id, () => admin.disableUser(u.id), 'User disabled')}
                                className="rounded p-1 text-muted hover:text-err"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                            {u.is_admin ? (
                              <button
                                title="Revoke admin"
                                onClick={() => userAction(u.id, () => admin.revokeAdmin(u.id), 'Admin revoked')}
                                className="rounded p-1 text-muted hover:text-warn"
                              >
                                <ShieldOff className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                title="Grant admin"
                                onClick={() => userAction(u.id, () => admin.grantAdmin(u.id), 'Admin granted')}
                                className="rounded p-1 text-muted hover:text-violet"
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              title="Revoke sessions"
                              onClick={() => userAction(u.id, () => admin.revokeSessions(u.id), 'Sessions revoked')}
                              className="rounded p-1 text-muted hover:text-warn"
                            >
                              <LogOut className="h-4 w-4" />
                            </button>
                            <button
                              title={u.is_unlimited ? 'Remove unlimited' : 'Set unlimited'}
                              onClick={() => userAction(u.id, () => admin.setUnlimited(u.id, !u.is_unlimited), u.is_unlimited ? 'Unlimited removed' : 'Set unlimited')}
                              className="rounded p-1 text-muted hover:text-brand"
                            >
                              <Infinity className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedUser === u.id && (
                        <tr key={`${u.id}-detail`} className="border-b border-line bg-bg-2/50">
                          <td colSpan={8} className="px-8 py-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              {userStats && (
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase text-muted">Stats</p>
                                  <div className="space-y-1 text-sm text-ink-2">
                                    <p>Memories: {String((userStats as Record<string, unknown>).memory_count ?? 0)}</p>
                                    <p>Today memories: {String((userStats as Record<string, unknown>).today_memories ?? 0)}</p>
                                    <p>Today recalls: {String((userStats as Record<string, unknown>).today_recalls ?? 0)}</p>
                                    <p>Today projects: {String((userStats as Record<string, unknown>).today_projects ?? 0)}</p>
                                  </div>
                                </div>
                              )}
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase text-muted">Recent logins</p>
                                {loginEvents.length === 0 ? (
                                  <p className="text-sm text-muted">No login events</p>
                                ) : (
                                  <ul className="space-y-1 text-sm text-ink-2">
                                    {loginEvents.slice(0, 10).map((ev, i) => (
                                      <li key={i}>
                                        {String(ev.ip || '?')} — {ev.created_at ? new Date(String(ev.created_at)).toLocaleString() : '?'}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No users</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Invites ───────────────────────────────── */}
          {tab === 'invites' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Status</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Expires</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Notes</th>
                    <th className="px-4 py-3 font-medium text-ink-2" />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const status = inv.revoked_at ? 'revoked' : inv.accepted_at ? 'accepted' : 'pending';
                    return (
                      <tr key={inv.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 text-ink">{inv.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={status === 'accepted' ? 'ok' : status === 'revoked' ? 'err' : 'warn'}>
                            {status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-muted">
                          {inv.notes || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {status === 'pending' && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="rounded p-1.5 text-muted transition-colors hover:bg-err/10 hover:text-err"
                              title="Revoke invite"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {invites.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No invites</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Orgs ──────────────────────────────────── */}
          {tab === 'orgs' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">ID</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Name</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsList.map((o, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted">{String(o.id || i)}</td>
                      <td className="px-4 py-3 text-ink">{String(o.name || '')}</td>
                      <td className="px-4 py-3 text-muted">
                        {o.created_at ? new Date(String(o.created_at)).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {orgsList.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No organisations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Waitlist ──────────────────────────────── */}
          {tab === 'waitlist' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Email</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Status</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistEntries.map((w, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{String(w.email || '')}</td>
                      <td className="px-4 py-3">
                        <Badge variant={w.status === 'approved' ? 'ok' : w.status === 'rejected' ? 'err' : 'warn'}>
                          {String(w.status || 'pending')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {w.created_at ? new Date(String(w.created_at)).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {waitlistEntries.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No waitlist entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Usage ─────────────────────────────────── */}
          {tab === 'usage' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">Date</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Event</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted">{row.date}</td>
                      <td className="px-4 py-3 text-ink">{row.event_type}</td>
                      <td className="px-4 py-3 font-mono text-ink">{row.count}</td>
                    </tr>
                  ))}
                  {usageData.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No usage data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Recall Logs ───────────────────────────── */}
          {tab === 'recall' && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-2 text-left">
                    <th className="px-4 py-3 font-medium text-ink-2">ID</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Query</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Strategy</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Served By</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Duration</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Project</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Results</th>
                    <th className="px-4 py-3 font-medium text-ink-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recallLogs.map((log) => (
                    <tr key={log.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted">{log.id}</td>
                      <td className="max-w-[250px] truncate px-4 py-3 text-ink">{log.query_text}</td>
                      <td className="px-4 py-3">
                        <Badge variant="muted">{log.strategy}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {(log.served_by as string | undefined)
                          || (log.score_details?.served_by as string | undefined)
                          || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {(() => {
                          const raw = (log.duration_ms as number | undefined)
                            ?? (log.score_details?.total_duration_ms as number | undefined)
                            ?? (log.score_details?.duration_ms as number | undefined);
                          return raw != null ? `${raw} ms` : '—';
                        })()}
                      </td>
                      <td className="px-4 py-3 text-muted">#{log.project_id}</td>
                      <td className="px-4 py-3 text-muted">{log.ranked_memory_ids.length}</td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {recallLogs.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No recall logs</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── System ────────────────────────────────── */}
          {tab === 'system' && (
            <div className="space-y-6">
              <Card>
                <h2 className="mb-4 text-lg font-semibold">CAG Cache</h2>
                {cagStats ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Status</p>
                        <p className="mt-1 font-semibold text-ink">
                          {cagStats.enabled ? 'Enabled' : 'Disabled'} ({cagStats.mode})
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Cache items</p>
                        <p className="mt-1 font-semibold text-ink">
                          {cagStats.cache_items} / {cagStats.cache_max_items}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Hit rate</p>
                        <p className="mt-1 font-semibold text-ink">
                          {(cagStats.hit_rate * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Queries</p>
                        <p className="mt-1 font-semibold text-ink">
                          {cagStats.total_queries} ({cagStats.total_hits} hits / {cagStats.total_misses} misses)
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Avg pheromone</p>
                        <p className="mt-1 font-semibold text-ink">{cagStats.avg_pheromone.toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Total evicted</p>
                        <p className="mt-1 font-semibold text-ink">{cagStats.total_evicted}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">KV stub</p>
                        <p className="mt-1 font-semibold text-ink">
                          {cagStats.kv_stub_enabled ? `On (${cagStats.kv_token_budget_used} tokens)` : 'Off'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Embedding</p>
                        <p className="mt-1 font-mono text-sm text-ink">{cagStats.embedding_model}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={handleEvaporate}>
                      Trigger evaporation
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted">CAG cache stats unavailable.</p>
                )}
              </Card>
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Notes (optional)</label>
            <Input
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
              placeholder="Reason for invite..."
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
