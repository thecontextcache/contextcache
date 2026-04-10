'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  admin,
  type AdminUser,
  type AdminInvite,
  type AdminWaitlistEntry,
  type AdminRecallLog,
  type AdminRecallEval,
  type AdminRecallFeedback,
  type AdminContextCompilationDetail,
  type AdminContextCompilationHistoryEntry,
  type AdminContextCompilationDiff,
  type AdminRecallMemorySignal,
  type AdminRecallMemorySignalDetail,
  type AdminRecallReviewQueueItem,
  type AdminQueryProfile,
  type AdminQueryProfileDetail,
  type CagCacheStats,
  type AdminLlmHealth,
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
  const [waitlistEntries, setWaitlistEntries] = useState<AdminWaitlistEntry[]>([]);

  // Usage
  const [usageData, setUsageData] = useState<AdminUsageRow[]>([]);

  // Recall logs
  const [recallLogs, setRecallLogs] = useState<AdminRecallLog[]>([]);
  const [recallEval, setRecallEval] = useState<AdminRecallEval | null>(null);
  const [recallFeedback, setRecallFeedback] = useState<AdminRecallFeedback[]>([]);
  const [memorySignals, setMemorySignals] = useState<AdminRecallMemorySignal[]>([]);
  const [queryProfiles, setQueryProfiles] = useState<AdminQueryProfile[]>([]);
  const [selectedCompilation, setSelectedCompilation] = useState<AdminContextCompilationDetail | null>(null);
  const [selectedCompilationHistory, setSelectedCompilationHistory] = useState<AdminContextCompilationHistoryEntry[]>([]);
  const [selectedCompilationDiff, setSelectedCompilationDiff] = useState<AdminContextCompilationDiff | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<AdminQueryProfileDetail | null>(null);
  const [selectedMemorySignal, setSelectedMemorySignal] = useState<AdminRecallMemorySignalDetail | null>(null);
  const [reviewQueue, setReviewQueue] = useState<AdminRecallReviewQueueItem[]>([]);
  const [workingProfileId, setWorkingProfileId] = useState<number | null>(null);
  const [workingMemoryId, setWorkingMemoryId] = useState<number | null>(null);
  const [workingCompilationId, setWorkingCompilationId] = useState<number | null>(null);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'all' | 'open' | 'resolved' | 'archived'>('all');
  const [reviewNetDirection, setReviewNetDirection] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [reviewIncludeArchived, setReviewIncludeArchived] = useState(true);
  const [reviewIncludeResolved, setReviewIncludeResolved] = useState(false);

  // System / CAG
  const [cagStats, setCagStats] = useState<CagCacheStats | null>(null);
  const [llmHealth, setLlmHealth] = useState<AdminLlmHealth | null>(null);

  const [loading, setLoading] = useState(true);

  // Invite dialog
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'recall') return;
    loadRecallPanel();
  }, [tab, reviewSearch, reviewStatusFilter, reviewNetDirection, reviewIncludeArchived, reviewIncludeResolved]);

  async function loadRecallPanel() {
    const [logs, evalData, feedback, profiles, memorySignalRows, reviewQueueRows] = await Promise.all([
      admin.recallLogs(),
      admin.recallEval(),
      admin.recallFeedback(12),
      admin.queryProfiles(12, 0, undefined, true),
      admin.recallMemorySignals(10),
      admin.recallReviewQueue({
        limit: 20,
        includeArchived: reviewIncludeArchived,
        includeResolved: reviewIncludeResolved,
        reviewStatus: reviewStatusFilter === 'all' ? undefined : reviewStatusFilter,
        search: reviewSearch.trim() || undefined,
        netDirection: reviewNetDirection === 'all' ? undefined : reviewNetDirection,
      }),
    ]);
    setRecallLogs(logs);
    setRecallEval(evalData);
    setRecallFeedback(feedback);
    setQueryProfiles(profiles);
    setMemorySignals(memorySignalRows);
    setReviewQueue(reviewQueueRows);
  }

  async function refreshRecallSignals() {
    const [memorySignalRows, reviewQueueRows] = await Promise.all([
      admin.recallMemorySignals(10),
      admin.recallReviewQueue({
        limit: 20,
        includeArchived: reviewIncludeArchived,
        includeResolved: reviewIncludeResolved,
        reviewStatus: reviewStatusFilter === 'all' ? undefined : reviewStatusFilter,
        search: reviewSearch.trim() || undefined,
        netDirection: reviewNetDirection === 'all' ? undefined : reviewNetDirection,
      }),
    ]);
    setMemorySignals(memorySignalRows);
    setReviewQueue(reviewQueueRows);
  }

  function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
          setWaitlistEntries(data);
          break;
        }
        case 'usage': {
          const data = await admin.usage();
          setUsageData(data);
          break;
        }
        case 'recall': {
          await loadRecallPanel();
          break;
        }
        case 'system': {
          const [cagRes, llmRes] = await Promise.allSettled([
            admin.cagCacheStats(),
            admin.llmHealth(),
          ]);
          setCagStats(cagRes.status === 'fulfilled' ? cagRes.value : null);
          setLlmHealth(llmRes.status === 'fulfilled' ? llmRes.value : null);
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
      await loadTab('users');
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

  async function handleApproveWaitlist(id: number) {
    try {
      await admin.approveWaitlist(id);
      toast('success', 'Waitlist entry approved and invite sent');
      await loadTab('waitlist');
      await loadTab('invites');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to approve waitlist entry');
    }
  }

  async function handleRejectWaitlist(id: number) {
    try {
      await admin.rejectWaitlist(id);
      toast('success', 'Waitlist entry rejected');
      await loadTab('waitlist');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to reject waitlist entry');
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

  async function openCompilationDetail(compilationId: number) {
    try {
      const detail = await admin.recallCompilationDetail(compilationId);
      const history = await admin.recallCompilationHistory(compilationId, undefined, 8);
      setSelectedCompilation(detail);
      setSelectedCompilationHistory(history);
      if (history.length > 1) {
        setSelectedCompilationDiff(await admin.recallCompilationDiff(compilationId, history[1].id));
      } else {
        setSelectedCompilationDiff(null);
      }
    } catch {
      toast('error', 'Failed to load compilation detail');
    }
  }

  async function compareCompilation(compilationId: number, otherId?: number) {
    try {
      const diff = await admin.recallCompilationDiff(compilationId, otherId);
      setSelectedCompilationDiff(diff);
    } catch {
      toast('error', 'Failed to compare compilations');
    }
  }

  async function openQueryProfile(profileId: number) {
    try {
      const detail = await admin.queryProfileDetail(profileId);
      setSelectedProfile(detail);
    } catch {
      toast('error', 'Failed to load query profile');
    }
  }

  async function toggleQueryProfileAutoApply(profile: AdminQueryProfile) {
    setWorkingProfileId(profile.id);
    try {
      const updated = await admin.disableQueryProfileAutoApply(profile.id, !profile.auto_apply_disabled);
      setQueryProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedProfile?.id === updated.id) {
        const detail = await admin.queryProfileDetail(updated.id);
        setSelectedProfile(detail);
      }
      toast('success', updated.auto_apply_disabled ? 'Auto-apply disabled' : 'Auto-apply enabled');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update query profile');
    } finally {
      setWorkingProfileId(null);
    }
  }

  async function resetQueryProfile(profileId: number) {
    setWorkingProfileId(profileId);
    try {
      const updated = await admin.resetQueryProfileFeedback(profileId);
      setQueryProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedProfile?.id === updated.id) {
        const detail = await admin.queryProfileDetail(updated.id);
        setSelectedProfile(detail);
      }
      toast('success', 'Query profile feedback reset');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to reset query profile');
    } finally {
      setWorkingProfileId(null);
    }
  }

  async function setQueryProfilePreferredFormat(profileId: number, preferredTargetFormat: string | null) {
    setWorkingProfileId(profileId);
    try {
      const updated = await admin.setQueryProfilePreferredFormat(profileId, preferredTargetFormat);
      setQueryProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedProfile?.id === updated.id) {
        const detail = await admin.queryProfileDetail(updated.id);
        setSelectedProfile(detail);
      }
      toast('success', preferredTargetFormat ? `Preferred format set to ${preferredTargetFormat}` : 'Preferred format cleared');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update preferred format');
    } finally {
      setWorkingProfileId(null);
    }
  }

  async function acceptQueryProfileSuggestion(profileId: number) {
    setWorkingProfileId(profileId);
    try {
      const updated = await admin.acceptQueryProfileSuggestion(profileId);
      setQueryProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedProfile?.id === updated.id) {
        setSelectedProfile(await admin.queryProfileDetail(updated.id));
      }
      toast('success', 'Suggestion accepted');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to accept suggestion');
    } finally {
      setWorkingProfileId(null);
    }
  }

  async function rejectQueryProfileSuggestion(profileId: number) {
    setWorkingProfileId(profileId);
    try {
      const updated = await admin.rejectQueryProfileSuggestion(profileId);
      setQueryProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedProfile?.id === updated.id) {
        setSelectedProfile(await admin.queryProfileDetail(updated.id));
      }
      toast('success', 'Suggestion rejected');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to reject suggestion');
    } finally {
      setWorkingProfileId(null);
    }
  }

  function queueRowFromDetail(detail: AdminRecallMemorySignalDetail): AdminRecallReviewQueueItem {
    return {
      memory_id: detail.memory_id,
      project_id: detail.project_id,
      memory_type: detail.memory_type,
      title: detail.title,
      source: detail.source,
      feedback_total: detail.feedback_total,
      net_score: detail.net_score,
      review_status: detail.review_status,
      marked_for_review: detail.marked_for_review,
      archived_from_recall_admin: detail.archived_from_recall_admin,
      review_marked_at: detail.metadata?.review_marked_at ? String(detail.metadata.review_marked_at) : null,
      archived_at: detail.metadata?.archived_from_recall_admin_at ? String(detail.metadata.archived_from_recall_admin_at) : null,
      latest_note: detail.review_notes?.[0]?.note ? String(detail.review_notes[0].note) : null,
      notes_count: detail.review_notes?.length ?? 0,
      last_feedback_at: detail.last_feedback_at,
      created_at: detail.created_at,
      updated_at: detail.updated_at,
    };
  }

  async function openMemorySignal(memoryId: number) {
    try {
      const detail = await admin.recallMemorySignalDetail(memoryId);
      setSelectedMemorySignal(detail);
    } catch {
      toast('error', 'Failed to load memory detail');
    }
  }

  async function markMemorySignalForReview(memoryId: number) {
    setWorkingMemoryId(memoryId);
    try {
      const detail = await admin.markMemorySignalForReview(memoryId);
      setSelectedMemorySignal(detail);
      setMemorySignals((prev) => prev.map((row) => (row.memory_id === detail.memory_id ? { ...row, ...detail } : row)));
      await refreshRecallSignals();
      toast('success', 'Memory marked for review');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to mark memory for review');
    } finally {
      setWorkingMemoryId(null);
    }
  }

  async function archiveMemorySignal(memoryId: number) {
    setWorkingMemoryId(memoryId);
    try {
      const detail = await admin.archiveMemorySignal(memoryId);
      setSelectedMemorySignal(detail);
      setMemorySignals((prev) => prev.map((row) => (row.memory_id === detail.memory_id ? { ...row, ...detail } : row)));
      await refreshRecallSignals();
      toast('success', 'Memory archived from recall admin');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to archive memory');
    } finally {
      setWorkingMemoryId(null);
    }
  }

  async function resolveMemorySignal(memoryId: number) {
    const note = window.prompt('Optional note for resolving this review:') ?? undefined;
    setWorkingMemoryId(memoryId);
    try {
      const detail = await admin.resolveMemorySignalReview(memoryId, note);
      setSelectedMemorySignal(detail);
      await refreshRecallSignals();
      toast('success', 'Review resolved');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to resolve review');
    } finally {
      setWorkingMemoryId(null);
    }
  }

  async function reopenMemorySignal(memoryId: number) {
    const note = window.prompt('Optional note for reopening this review:') ?? undefined;
    setWorkingMemoryId(memoryId);
    try {
      const detail = await admin.reopenMemorySignalReview(memoryId, note);
      setSelectedMemorySignal(detail);
      await refreshRecallSignals();
      toast('success', 'Review reopened');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to reopen review');
    } finally {
      setWorkingMemoryId(null);
    }
  }

  async function addMemorySignalNote(memoryId: number) {
    const note = window.prompt('Add a review note:');
    if (!note) return;
    setWorkingMemoryId(memoryId);
    try {
      const detail = await admin.noteMemorySignalReview(memoryId, note);
      setSelectedMemorySignal(detail);
      await refreshRecallSignals();
      toast('success', 'Note added');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to add note');
    } finally {
      setWorkingMemoryId(null);
    }
  }

  async function exportCompilationDetail(compilationId: number) {
    setWorkingCompilationId(compilationId);
    try {
      const exported = await admin.exportCompilationDetail(compilationId);
      downloadJson(exported.filename, exported.payload);
      toast('success', 'Compilation detail exported');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to export compilation detail');
    } finally {
      setWorkingCompilationId(null);
    }
  }

  async function exportCompilationDiff(compilationId: number, otherId?: number) {
    setWorkingCompilationId(compilationId);
    try {
      const exported = await admin.exportCompilationDiff(compilationId, otherId);
      downloadJson(exported.filename, exported.payload);
      toast('success', 'Compilation diff exported');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to export compilation diff');
    } finally {
      setWorkingCompilationId(null);
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
          <h1 className="text-2xl font-semibold">Admin</h1>
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
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr className="cc-table-head">
                    <th className="cc-th" />
                    <th className="cc-th">ID</th>
                    <th className="cc-th">Email</th>
                    <th className="cc-th">Role</th>
                    <th className="cc-th">Status</th>
                    <th className="cc-th">Created</th>
                    <th className="cc-th">Last Login</th>
                    <th className="cc-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <Fragment key={`user-row-${u.id}`}>
                      <tr className="cc-tr">
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
                        <td className="cc-td-muted">{u.id}</td>
                        <td className="cc-td">{u.email}</td>
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
                        <td className="cc-td-muted">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="cc-td-muted">
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
                    </Fragment>
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
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr className="cc-table-head">
                    <th className="cc-th">Email</th>
                    <th className="cc-th">Status</th>
                    <th className="cc-th">Created</th>
                    <th className="cc-th">Expires</th>
                    <th className="cc-th">Notes</th>
                    <th className="cc-th" />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const status = inv.revoked_at ? 'revoked' : inv.accepted_at ? 'accepted' : 'pending';
                    return (
                      <tr key={inv.id} className="cc-tr">
                        <td className="cc-td">{inv.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={status === 'accepted' ? 'ok' : status === 'revoked' ? 'err' : 'warn'}>
                            {status}
                          </Badge>
                        </td>
                        <td className="cc-td-muted">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="cc-td-muted">
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
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr className="cc-table-head">
                    <th className="cc-th">ID</th>
                    <th className="cc-th">Name</th>
                    <th className="cc-th">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsList.map((o, i) => (
                    <tr key={i} className="cc-tr">
                      <td className="cc-td-muted">{String(o.id || i)}</td>
                      <td className="cc-td">{String(o.name || '')}</td>
                      <td className="cc-td-muted">
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
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr className="cc-table-head">
                    <th className="cc-th">Email</th>
                    <th className="cc-th">Name</th>
                    <th className="cc-th">Company</th>
                    <th className="cc-th">Use case</th>
                    <th className="cc-th">Status</th>
                    <th className="cc-th">Date</th>
                    <th className="cc-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistEntries.map((w, i) => (
                    <tr key={i} className="cc-tr">
                      <td className="cc-td">{w.email}</td>
                      <td className="cc-td-muted">{w.name || '—'}</td>
                      <td className="cc-td-muted">{w.company || '—'}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-muted">{w.use_case || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={w.status === 'approved' ? 'ok' : w.status === 'rejected' ? 'err' : 'warn'}>
                          {w.status}
                        </Badge>
                      </td>
                      <td className="cc-td-muted">
                        {w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {w.status === 'pending' ? (
                            <>
                              <Button
                                size="sm"
                                className="h-8"
                                onClick={() => handleApproveWaitlist(w.id)}
                                title="Approve and send invite"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-err hover:bg-err/10"
                                onClick={() => handleRejectWaitlist(w.id)}
                                title="Reject waitlist entry"
                              >
                                Reject
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {waitlistEntries.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No waitlist entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Usage ─────────────────────────────────── */}
          {tab === 'usage' && (
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr className="cc-table-head">
                    <th className="cc-th">Date</th>
                    <th className="cc-th">Event</th>
                    <th className="cc-th">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.map((row, i) => (
                    <tr key={i} className="cc-tr">
                      <td className="cc-td-muted">{row.date}</td>
                      <td className="cc-td">{row.event_type}</td>
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
            <div className="space-y-6">
              {recallEval && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <p className="text-xs uppercase tracking-wider text-muted">Queries</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">{recallEval.total_queries}</p>
                    <p className="mt-1 text-xs text-muted">
                      empty {recallEval.empty_query_count} · no-result {recallEval.no_result_count}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wider text-muted">Feedback</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">{recallEval.total_feedback}</p>
                    <p className="mt-1 text-xs text-muted">
                      profiles {recallEval.query_profile_count}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wider text-muted">Avg Duration</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {recallEval.avg_total_duration_ms != null ? `${recallEval.avg_total_duration_ms} ms` : '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      max {recallEval.max_total_duration_ms != null ? `${recallEval.max_total_duration_ms} ms` : '—'}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wider text-muted">Preferred Formats</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(recallEval.preferred_format_counts).length > 0 ? Object.entries(recallEval.preferred_format_counts).map(([format, count]) => (
                        <Badge key={format} variant="violet">{format}: {count}</Badge>
                      )) : <span className="text-sm text-muted">No auto-apply profiles yet</span>}
                    </div>
                  </Card>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Recall Logs</h2>
                      <p className="mt-1 text-sm text-muted">Recent recall executions and retrieval outcomes.</p>
                    </div>
                  </div>
                  <div className="cc-table-wrap">
                    <table className="cc-table">
                      <thead>
                        <tr className="cc-table-head">
                          <th className="cc-th">ID</th>
                          <th className="cc-th">Query</th>
                          <th className="cc-th">Strategy</th>
                          <th className="cc-th">Served By</th>
                          <th className="cc-th">Duration</th>
                          <th className="cc-th">Project</th>
                          <th className="cc-th">Results</th>
                          <th className="cc-th">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recallLogs.map((log) => (
                          <tr key={log.id} className="cc-tr">
                            <td className="cc-td-muted">{log.id}</td>
                            <td className="max-w-[250px] truncate px-4 py-3 text-ink">{log.query_text}</td>
                            <td className="px-4 py-3">
                              <Badge variant="muted">{log.strategy}</Badge>
                            </td>
                            <td className="cc-td-muted">
                              {(log.served_by as string | undefined)
                                || (log.score_details?.served_by as string | undefined)
                                || '—'}
                            </td>
                            <td className="cc-td-muted">
                              {(() => {
                                const raw = (log.duration_ms as number | undefined)
                                  ?? (log.score_details?.total_duration_ms as number | undefined)
                                  ?? (log.score_details?.duration_ms as number | undefined);
                                return raw != null ? `${raw} ms` : '—';
                              })()}
                            </td>
                            <td className="cc-td-muted">#{log.project_id}</td>
                            <td className="cc-td-muted">{log.ranked_memory_ids.length}</td>
                            <td className="cc-td-muted">
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
                </Card>

                <div className="space-y-6">
                  <Card>
                    <h2 className="text-lg font-semibold">Profile Signals</h2>
                    <p className="mt-1 text-sm text-muted">Queries that currently influence `format=auto`.</p>
                    <div className="mt-4 space-y-3">
                      {queryProfiles.length > 0 ? queryProfiles.map((profile) => (
                        <div key={profile.id} className="rounded-lg border border-line/70 bg-bg-2/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{profile.sample_query}</span>
                            {profile.preferred_target_format && (
                              <Badge variant={profile.auto_apply_enabled ? 'violet' : 'muted'}>
                                {profile.preferred_target_format}
                              </Badge>
                            )}
                            <Badge variant={profile.auto_apply_enabled ? 'ok' : 'warn'}>
                              {profile.auto_apply_enabled ? 'auto applies' : 'held back'}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                            <span>queries {profile.total_queries}</span>
                            <span>positive {profile.positive_feedback_count}</span>
                            <span>negative {profile.negative_feedback_count}</span>
                            <span>feedback {profile.feedback_total}</span>
                          </div>
                          {profile.suggested_target_format && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                              <Badge variant="warn">suggest {profile.suggested_target_format}</Badge>
                              <span>{profile.suggestion_reason || 'signal-based recommendation'}</span>
                              {profile.suggestion_confidence != null && <span>confidence {profile.suggestion_confidence}</span>}
                              <span>state {profile.suggestion_state}</span>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openQueryProfile(profile.id)}>
                              Inspect
                            </Button>
                            {profile.suggested_target_format && profile.suggestion_state !== 'accepted' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={workingProfileId === profile.id}
                                onClick={() => acceptQueryProfileSuggestion(profile.id)}
                              >
                                Accept suggestion
                              </Button>
                            )}
                            {profile.suggested_target_format && profile.suggestion_state !== 'rejected' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={workingProfileId === profile.id}
                                onClick={() => rejectQueryProfileSuggestion(profile.id)}
                              >
                                Reject suggestion
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingProfileId === profile.id}
                              onClick={() => setQueryProfilePreferredFormat(profile.id, 'text')}
                            >
                              Prefer text
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingProfileId === profile.id}
                              onClick={() => setQueryProfilePreferredFormat(profile.id, 'toonx')}
                            >
                              Prefer toonx
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingProfileId === profile.id}
                              onClick={() => toggleQueryProfileAutoApply(profile)}
                            >
                              {profile.auto_apply_disabled ? 'Enable auto' : 'Disable auto'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingProfileId === profile.id}
                              onClick={() => resetQueryProfile(profile.id)}
                            >
                              Reset feedback
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <p className="text-sm text-muted">No query profiles with feedback yet.</p>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <h2 className="text-lg font-semibold">Recent Feedback</h2>
                    <p className="mt-1 text-sm text-muted">Latest recall feedback flowing back from the dashboard.</p>
                    <div className="mt-4 space-y-3">
                      {recallFeedback.length > 0 ? recallFeedback.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-line/70 bg-bg-2/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={entry.label === 'helpful' || entry.label === 'pinned' ? 'ok' : entry.label === 'wrong' ? 'err' : 'warn'}>
                              {entry.label}
                            </Badge>
                            <span className="text-sm text-ink">compilation #{entry.compilation_id}</span>
                            {entry.entity_id != null && (
                              <span className="text-sm text-muted">memory #{entry.entity_id}</span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            project #{entry.project_id} · {new Date(entry.created_at).toLocaleString()}
                          </p>
                          <div className="mt-3">
                            <Button size="sm" variant="secondary" onClick={() => openCompilationDetail(entry.compilation_id)}>
                              Inspect compilation
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <p className="text-sm text-muted">No feedback recorded yet.</p>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <h2 className="text-lg font-semibold">Memory Signals</h2>
                    <p className="mt-1 text-sm text-muted">Evidence-level feedback trends across recalled memories.</p>
                    <div className="mt-4 space-y-3">
                      {memorySignals.length > 0 ? memorySignals.map((signal) => (
                        <div key={signal.memory_id} className="rounded-lg border border-line/70 bg-bg-2/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={signal.net_score >= 0 ? 'ok' : 'err'}>
                              net {signal.net_score}
                            </Badge>
                            <span className="font-medium text-ink">{signal.title || `Memory #${signal.memory_id}`}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                            <span>type {signal.memory_type}</span>
                            <span>helpful {signal.helpful_count}</span>
                            <span>wrong {signal.wrong_count}</span>
                            <span>stale {signal.stale_count}</span>
                            <span>pinned {signal.pinned_count}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openMemorySignal(signal.memory_id)}>
                              Inspect memory
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingMemoryId === signal.memory_id}
                              onClick={() => markMemorySignalForReview(signal.memory_id)}
                            >
                              Mark review
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={workingMemoryId === signal.memory_id}
                              onClick={() => archiveMemorySignal(signal.memory_id)}
                            >
                              Archive
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <p className="text-sm text-muted">No memory-level signals yet.</p>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <h2 className="text-lg font-semibold">Review Queue</h2>
                    <p className="mt-1 text-sm text-muted">Memories flagged for review or archived from recall workflows.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <Input
                        value={reviewSearch}
                        onChange={(e) => setReviewSearch(e.target.value)}
                        placeholder="Search title, content, source"
                      />
                      <select
                        className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink"
                        value={reviewStatusFilter}
                        onChange={(e) => setReviewStatusFilter(e.target.value as 'all' | 'open' | 'resolved' | 'archived')}
                      >
                        <option value="all">All statuses</option>
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="archived">Archived</option>
                      </select>
                      <select
                        className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink"
                        value={reviewNetDirection}
                        onChange={(e) => setReviewNetDirection(e.target.value as 'all' | 'positive' | 'negative' | 'neutral')}
                      >
                        <option value="all">All net scores</option>
                        <option value="negative">Negative</option>
                        <option value="neutral">Neutral</option>
                        <option value="positive">Positive</option>
                      </select>
                      <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={reviewIncludeArchived}
                          onChange={(e) => setReviewIncludeArchived(e.target.checked)}
                        />
                        Include archived
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={reviewIncludeResolved}
                          onChange={(e) => setReviewIncludeResolved(e.target.checked)}
                        />
                        Include resolved
                      </label>
                    </div>
                    <div className="mt-4 space-y-3">
                      {reviewQueue.length > 0 ? reviewQueue.map((item) => (
                        <div key={item.memory_id} className="rounded-lg border border-line/70 bg-bg-2/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.marked_for_review && <Badge variant="warn">review</Badge>}
                            {item.archived_from_recall_admin && <Badge variant="err">archived</Badge>}
                            <span className="font-medium text-ink">{item.title || `Memory #${item.memory_id}`}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                            <span>type {item.memory_type}</span>
                            <span>source {item.source}</span>
                            <span>feedback {item.feedback_total}</span>
                            <span>net {item.net_score}</span>
                            <span>status {item.review_status}</span>
                            <span>notes {item.notes_count}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openMemorySignal(item.memory_id)}>
                              Inspect memory
                            </Button>
                            {item.review_status !== 'resolved' ? (
                              <Button size="sm" variant="ghost" loading={workingMemoryId === item.memory_id} onClick={() => resolveMemorySignal(item.memory_id)}>
                                Resolve
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" loading={workingMemoryId === item.memory_id} onClick={() => reopenMemorySignal(item.memory_id)}>
                                Reopen
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" loading={workingMemoryId === item.memory_id} onClick={() => addMemorySignalNote(item.memory_id)}>
                              Add note
                            </Button>
                          </div>
                          {item.latest_note && <p className="mt-2 text-xs text-muted">{item.latest_note}</p>}
                        </div>
                      )) : (
                        <p className="text-sm text-muted">No memories currently need review.</p>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* ── System ────────────────────────────────── */}
          {tab === 'system' && (
            <div className="space-y-6">
              <Card>
                <h2 className="mb-4 text-lg font-semibold">LLM Extraction Health</h2>
                {llmHealth ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Status</p>
                        <p className="mt-1 font-semibold text-ink">
                          {llmHealth.ready ? 'Ready' : 'Not ready'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Provider / Model</p>
                        <p className="mt-1 font-mono text-sm text-ink">
                          {llmHealth.provider} · {llmHealth.model}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">Prerequisites</p>
                        <p className="mt-1 font-semibold text-ink">
                          worker={llmHealth.worker_enabled ? 'on' : 'off'} · key={llmHealth.google_api_key_configured ? 'set' : 'missing'} · sdk={llmHealth.google_genai_installed ? 'ok' : 'missing'}
                        </p>
                      </div>
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                      {llmHealth.notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted">LLM health unavailable.</p>
                )}
              </Card>

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
                        <p className="text-xs uppercase tracking-wider text-muted">Avg cache weight</p>
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

      <Dialog open={selectedCompilation !== null} onClose={() => {
        setSelectedCompilation(null);
        setSelectedCompilationHistory([]);
        setSelectedCompilationDiff(null);
      }} title="Compilation Detail">
        {selectedCompilation && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{selectedCompilation.target_format}</Badge>
              {selectedCompilation.renderer && <Badge variant="violet">{selectedCompilation.renderer}</Badge>}
              {selectedCompilation.retrieval_strategy && <Badge variant="ok">{selectedCompilation.retrieval_strategy}</Badge>}
              {selectedCompilation.bundle_id && <Badge variant="warn">{selectedCompilation.bundle_id}</Badge>}
            </div>
            <div className="text-sm text-ink-2">
              <p><span className="font-medium text-ink">Query:</span> {selectedCompilation.query_text || '(empty)'}</p>
              <p><span className="font-medium text-ink">Latency:</span> {selectedCompilation.latency_ms != null ? `${selectedCompilation.latency_ms} ms` : '—'}</p>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Retrieval Plan</p>
              <pre className="overflow-auto text-xs text-ink-2 whitespace-pre-wrap">{JSON.stringify((selectedCompilation.compilation_json || {}).retrieval_plan || {}, null, 2)}</pre>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Compiled Output</p>
              <pre className="max-h-72 overflow-auto text-xs text-ink-2 whitespace-pre-wrap">{selectedCompilation.compilation_text || ''}</pre>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">History</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={workingCompilationId === selectedCompilation.id}
                    onClick={() => exportCompilationDetail(selectedCompilation.id)}
                  >
                    Export detail JSON
                  </Button>
                  {selectedCompilationHistory.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => compareCompilation(selectedCompilation.id, selectedCompilationHistory[1].id)}>
                      Compare to previous
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {selectedCompilationHistory.length > 0 ? selectedCompilationHistory.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                    <Badge variant={entry.id === selectedCompilation.id ? 'violet' : 'muted'}>#{entry.id}</Badge>
                    <span>{entry.target_format}</span>
                    <span>{entry.retrieval_strategy || '—'}</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                    {entry.id !== selectedCompilation.id && (
                      <Button size="sm" variant="ghost" onClick={() => compareCompilation(selectedCompilation.id, entry.id)}>
                        Compare
                      </Button>
                    )}
                  </div>
                )) : (
                  <p className="text-xs text-muted">No related history yet.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">Diff Summary</p>
                {selectedCompilationDiff && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={workingCompilationId === selectedCompilation.id}
                    onClick={() => exportCompilationDiff(selectedCompilation.id, selectedCompilationDiff.other_compilation_id)}
                  >
                    Export diff JSON
                  </Button>
                )}
              </div>
              {selectedCompilationDiff ? (
                <div className="space-y-2 text-xs text-ink-2">
                  <p>Formats: {selectedCompilationDiff.other_target_format} -> {selectedCompilationDiff.base_target_format}</p>
                  <p>Strategies: {selectedCompilationDiff.other_retrieval_strategy || '—'} -> {selectedCompilationDiff.base_retrieval_strategy || '—'}</p>
                  <p>Served by: {selectedCompilationDiff.other_served_by || '—'} -> {selectedCompilationDiff.base_served_by || '—'}</p>
                  <p>Items: {selectedCompilationDiff.other_item_count} -> {selectedCompilationDiff.base_item_count}</p>
                  <p>Added item ids: {selectedCompilationDiff.item_ids_added.join(', ') || 'none'}</p>
                  <p>Removed item ids: {selectedCompilationDiff.item_ids_removed.join(', ') || 'none'}</p>
                  <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify({
                    before: selectedCompilationDiff.retrieval_plan_before,
                    after: selectedCompilationDiff.retrieval_plan_after,
                  }, null, 2)}</pre>
                </div>
              ) : (
                <p className="text-xs text-muted">No comparison loaded.</p>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={selectedProfile !== null} onClose={() => setSelectedProfile(null)} title="Query Profile">
        {selectedProfile && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {selectedProfile.preferred_target_format && <Badge variant="violet">{selectedProfile.preferred_target_format}</Badge>}
              <Badge variant={selectedProfile.auto_apply_enabled ? 'ok' : 'warn'}>
                {selectedProfile.auto_apply_enabled ? 'auto applies' : 'not applying'}
              </Badge>
              {selectedProfile.auto_apply_disabled && <Badge variant="err">manually disabled</Badge>}
            </div>
            <div className="text-sm text-ink-2">
              <p><span className="font-medium text-ink">Query:</span> {selectedProfile.sample_query}</p>
              <p><span className="font-medium text-ink">Counts:</span> +{selectedProfile.positive_feedback_count} / -{selectedProfile.negative_feedback_count}</p>
              {selectedProfile.suggested_target_format && (
                <p><span className="font-medium text-ink">Suggestion:</span> {selectedProfile.suggested_target_format} ({selectedProfile.suggestion_reason || 'signal-based'})</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedProfile.suggested_target_format && selectedProfile.suggestion_state !== 'accepted' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={workingProfileId === selectedProfile.id}
                  onClick={() => acceptQueryProfileSuggestion(selectedProfile.id)}
                >
                  Accept suggestion
                </Button>
              )}
              {selectedProfile.suggested_target_format && selectedProfile.suggestion_state !== 'rejected' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={workingProfileId === selectedProfile.id}
                  onClick={() => rejectQueryProfileSuggestion(selectedProfile.id)}
                >
                  Reject suggestion
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => setQueryProfilePreferredFormat(selectedProfile.id, 'text')}
              >
                Prefer text
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => setQueryProfilePreferredFormat(selectedProfile.id, 'toon')}
              >
                Prefer toon
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => setQueryProfilePreferredFormat(selectedProfile.id, 'toonx')}
              >
                Prefer toonx
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => setQueryProfilePreferredFormat(selectedProfile.id, null)}
              >
                Clear preference
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => toggleQueryProfileAutoApply(selectedProfile)}
              >
                {selectedProfile.auto_apply_disabled ? 'Enable auto' : 'Disable auto'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingProfileId === selectedProfile.id}
                onClick={() => resetQueryProfile(selectedProfile.id)}
              >
                Reset feedback
              </Button>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Recent Feedback</p>
              <pre className="overflow-auto text-xs text-ink-2 whitespace-pre-wrap">{JSON.stringify(selectedProfile.recent_feedback || [], null, 2)}</pre>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Recent Admin Actions</p>
              {selectedProfile.recent_admin_actions?.length ? (
                <div className="space-y-2 text-xs text-ink-2">
                  {selectedProfile.recent_admin_actions.map((entry) => (
                    <div key={entry.id} className="rounded border border-line/70 bg-panel/60 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted">{entry.action}</Badge>
                        <span>{new Date(entry.created_at).toLocaleString()}</span>
                        <span>{String(entry.metadata?.actor_email || entry.actor_user_id || 'system')}</span>
                      </div>
                      <pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(entry.metadata || {}, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">No admin actions recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={selectedMemorySignal !== null} onClose={() => setSelectedMemorySignal(null)} title="Memory Signal">
        {selectedMemorySignal && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={selectedMemorySignal.net_score >= 0 ? 'ok' : 'err'}>net {selectedMemorySignal.net_score}</Badge>
              <Badge variant="muted">{selectedMemorySignal.memory_type}</Badge>
              {selectedMemorySignal.marked_for_review && <Badge variant="warn">marked for review</Badge>}
              {selectedMemorySignal.archived_from_recall_admin && <Badge variant="err">archived</Badge>}
            </div>
            <div className="text-sm text-ink-2">
              <p><span className="font-medium text-ink">Title:</span> {selectedMemorySignal.title || `Memory #${selectedMemorySignal.memory_id}`}</p>
              <p><span className="font-medium text-ink">Source:</span> {selectedMemorySignal.source}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                loading={workingMemoryId === selectedMemorySignal.memory_id}
                onClick={() => markMemorySignalForReview(selectedMemorySignal.memory_id)}
              >
                Mark review
              </Button>
              {selectedMemorySignal.review_status !== 'resolved' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={workingMemoryId === selectedMemorySignal.memory_id}
                  onClick={() => resolveMemorySignal(selectedMemorySignal.memory_id)}
                >
                  Resolve
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={workingMemoryId === selectedMemorySignal.memory_id}
                  onClick={() => reopenMemorySignal(selectedMemorySignal.memory_id)}
                >
                  Reopen
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                loading={workingMemoryId === selectedMemorySignal.memory_id}
                onClick={() => addMemorySignalNote(selectedMemorySignal.memory_id)}
              >
                Add note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={workingMemoryId === selectedMemorySignal.memory_id}
                onClick={() => archiveMemorySignal(selectedMemorySignal.memory_id)}
              >
                Archive
              </Button>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Content</p>
              <pre className="max-h-72 overflow-auto text-xs text-ink-2 whitespace-pre-wrap">{selectedMemorySignal.content}</pre>
            </div>
            <div className="rounded-lg border border-line bg-bg-2/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">Review Notes</p>
              <pre className="max-h-72 overflow-auto text-xs text-ink-2 whitespace-pre-wrap">{JSON.stringify(selectedMemorySignal.review_notes || [], null, 2)}</pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
