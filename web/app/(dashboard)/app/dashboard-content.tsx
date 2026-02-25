'use client';

import { useEffect, useState } from 'react';
import {
  projects,
  memories,
  recall,
  inbox,
  type Project,
  type Memory,
  type RecallResult,
  type InboxItem,
  ApiError,
} from '@/lib/api';
import { MEMORY_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonCard, SkeletonTable } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import {
  Plus,
  Trash2,
  FolderOpen,
  ChevronRight,
  Brain,
  ArrowLeft,
  Search,
  Inbox,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Pencil,
  Copy,
} from 'lucide-react';

type BadgeVariant = 'brand' | 'violet' | 'ok' | 'warn' | 'err' | 'muted';

const typeVariantMap: Record<string, BadgeVariant> = {
  decision: 'brand',
  finding: 'violet',
  snippet: 'ok',
  note: 'warn',
  issue: 'err',
  context: 'muted',
};

const typeBorderMap: Record<string, string> = {
  decision: 'border-l-brand',
  finding: 'border-l-violet',
  snippet: 'border-l-ok',
  note: 'border-l-warn',
  issue: 'border-l-err',
  context: 'border-l-muted',
};

export function DashboardContent() {
  const { toast } = useToast();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [memLoading, setMemLoading] = useState(false);

  // Create project dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Create memory dialog
  const [showCreateMem, setShowCreateMem] = useState(false);
  const [memTitle, setMemTitle] = useState('');
  const [memBody, setMemBody] = useState('');
  const [memType, setMemType] = useState('note');
  const [creatingMem, setCreatingMem] = useState(false);

  // Recall
  const [recallQuery, setRecallQuery] = useState('');
  const [recallResult, setRecallResult] = useState<RecallResult | null>(null);
  const [recalling, setRecalling] = useState(false);

  // Inbox
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Editing dialogs
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [savingProject, setSavingProject] = useState(false);

  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editMemTitle, setEditMemTitle] = useState('');
  const [editMemBody, setEditMemBody] = useState('');
  const [editMemType, setEditMemType] = useState('note');
  const [savingMemory, setSavingMemory] = useState(false);

  const [approvingItem, setApprovingItem] = useState<InboxItem | null>(null);
  const [approveType, setApproveType] = useState('note');
  const [approveTitle, setApproveTitle] = useState('');
  const [approveContent, setApproveContent] = useState('');
  const [approvingEdited, setApprovingEdited] = useState(false);

  // Confirm dialogs
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteMemoryTarget, setDeleteMemoryTarget] = useState<Memory | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await projects.list();
      setProjectList(data);
    } catch {
      toast('error', 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function openProject(project: Project) {
    setSelectedProject(project);
    setMemLoading(true);
    setRecallResult(null);
    setRecallQuery('');
    try {
      const data = await memories.list(project.id);
      setMemoryList(data);
    } catch {
      toast('error', 'Failed to load memories');
    } finally {
      setMemLoading(false);
    }
    loadInbox(project.id);
  }

  async function loadInbox(projectId: number) {
    setInboxLoading(true);
    try {
      const data = await inbox.list(projectId);
      setInboxItems(data.items);
      setInboxTotal(data.total);
    } catch {
      // Inbox may not be available — silent fail
      setInboxItems([]);
      setInboxTotal(0);
    } finally {
      setInboxLoading(false);
    }
  }

  async function handleRecall(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject || !recallQuery.trim()) return;
    setRecalling(true);
    try {
      const result = await recall.query(selectedProject.id, recallQuery);
      setRecallResult(result);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Recall failed');
    } finally {
      setRecalling(false);
    }
  }

  async function handleApproveInbox(itemId: number) {
    try {
      await inbox.approve(itemId);
      setInboxItems((prev) => prev.filter((i) => i.id !== itemId));
      setInboxTotal((prev) => prev - 1);
      toast('success', 'Item approved as memory');
      // Reload memories
      if (selectedProject) {
        const data = await memories.list(selectedProject.id);
        setMemoryList(data);
      }
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to approve');
    }
  }

  async function handleApproveInboxWithEdits(e: React.FormEvent) {
    e.preventDefault();
    if (!approvingItem) return;
    setApprovingEdited(true);
    try {
      await inbox.approve(approvingItem.id, {
        suggested_type: approveType,
        suggested_title: approveTitle || undefined,
        suggested_content: approveContent,
      });
      setInboxItems((prev) => prev.filter((i) => i.id !== approvingItem.id));
      setInboxTotal((prev) => Math.max(0, prev - 1));
      setApprovingItem(null);
      toast('success', 'Item approved with edits');
      if (selectedProject) {
        const data = await memories.list(selectedProject.id);
        setMemoryList(data);
      }
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to approve');
    } finally {
      setApprovingEdited(false);
    }
  }

  async function handleRejectInbox(itemId: number) {
    try {
      await inbox.reject(itemId);
      setInboxItems((prev) => prev.filter((i) => i.id !== itemId));
      setInboxTotal((prev) => prev - 1);
      toast('success', 'Item rejected');
    } catch {
      toast('error', 'Failed to reject');
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const p = await projects.create({ name: newName, description: newDesc || undefined });
      setProjectList((prev) => [...prev, p]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      toast('success', `Project "${p.name}" created`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject(id: number) {
    try {
      await projects.delete(id);
      setProjectList((prev) => prev.filter((p) => p.id !== id));
      if (selectedProject?.id === id) {
        setSelectedProject(null);
        setMemoryList([]);
      }
      toast('success', 'Project deleted');
    } catch {
      toast('error', 'Failed to delete project');
    }
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProject) return;
    setSavingProject(true);
    try {
      const updated = await projects.update(editingProject.id, {
        name: editProjectName,
        description: editProjectDesc || undefined,
      });
      setProjectList((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      if (selectedProject?.id === updated.id) {
        setSelectedProject((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      setEditingProject(null);
      toast('success', 'Project updated');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update project');
    } finally {
      setSavingProject(false);
    }
  }

  async function handleCreateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject) return;
    setCreatingMem(true);
    try {
      const m = await memories.create(selectedProject.id, {
        title: memTitle,
        body: memBody,
        type: memType,
      });
      setMemoryList((prev) => [...prev, m]);
      setShowCreateMem(false);
      setMemTitle('');
      setMemBody('');
      setMemType('note');
      toast('success', 'Memory card created');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to create memory');
    } finally {
      setCreatingMem(false);
    }
  }

  async function handleDeleteMemory(memId: number) {
    if (!selectedProject) return;
    try {
      await memories.delete(selectedProject.id, memId);
      setMemoryList((prev) => prev.filter((m) => m.id !== memId));
      toast('success', 'Memory deleted');
    } catch {
      toast('error', 'Failed to delete memory');
    }
  }

  async function handleUpdateMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject || !editingMemory) return;
    setSavingMemory(true);
    try {
      const updated = await memories.update(selectedProject.id, editingMemory.id, {
        title: editMemTitle,
        body: editMemBody,
        type: editMemType,
      });
      setMemoryList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingMemory(null);
      toast('success', 'Memory updated');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update memory');
    } finally {
      setSavingMemory(false);
    }
  }

  // ── Project Detail View ───────────────────────────────
  if (selectedProject) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => { setSelectedProject(null); setMemoryList([]); }}
          className="mb-6 flex items-center gap-2 rounded-lg py-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </button>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{selectedProject.name}</h1>
            {selectedProject.description && (
              <p className="mt-1 text-sm text-ink-2">{selectedProject.description}</p>
            )}
          </div>
          <Button size="sm" onClick={() => setShowCreateMem(true)}>
            <Plus className="h-4 w-4" />
            Add memory
          </Button>
        </div>

        {memLoading ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : memoryList.length === 0 ? (
          <Card className="py-12 text-center">
            <Brain className="mx-auto mb-3 h-10 w-10 text-muted" />
            <p className="text-sm text-ink-2">No memories yet. Add your first memory card.</p>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {memoryList.map((m) => (
              <Card key={m.id} hover className={`group relative border-l-4 ${typeBorderMap[m.type] || 'border-l-muted'}`}>
                <div className="mb-3 flex items-center gap-2.5">
                  <Badge variant={typeVariantMap[m.type] || 'muted'}>{m.type}</Badge>
                  <span className="text-xs text-muted">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mb-1.5 text-base font-semibold text-ink">{m.title || 'Untitled memory'}</h3>
                <p className="line-clamp-4 text-sm leading-relaxed text-ink-2">{m.body}</p>
                {m.tags && m.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-bg-2 px-2 py-0.5 text-[10px] text-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  title="Edit memory"
                  onClick={() => {
                    setEditingMemory(m);
                    setEditMemTitle(m.title || '');
                    setEditMemBody(m.body || '');
                    setEditMemType(m.type || 'note');
                  }}
                  className="absolute right-10 top-3 rounded p-1 text-muted opacity-0 transition-all hover:bg-brand/10 hover:text-brand group-hover:opacity-100"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  title="Delete memory"
                  onClick={() => setDeleteMemoryTarget(m)}
                  className="absolute right-3 top-3 rounded p-1 text-muted opacity-0 transition-all hover:bg-err/10 hover:text-err group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            ))}
          </div>
        )}

        {/* ── Recall Search ─────────────────────────── */}
        <div className="mt-10">
          <div className="mb-5">
            <h2 className="flex items-center gap-2.5 text-xl font-semibold">
              <Search className="h-5 w-5 text-brand" />
              Recall
            </h2>
            <p className="mt-1.5 text-sm text-ink-2">
              Search across your project&apos;s memory
            </p>
          </div>
          <form onSubmit={handleRecall} className="flex gap-3">
            <Input
              value={recallQuery}
              onChange={(e) => setRecallQuery(e.target.value)}
              placeholder="Ask the project brain..."
              className="flex-1"
            />
            <Button type="submit" loading={recalling}>
              Search
            </Button>
          </form>
          {recallResult && (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted">
                {recallResult.items.length} result{recallResult.items.length !== 1 ? 's' : ''} for &quot;{recallResult.query}&quot;
              </p>
              {recallResult.items.map((item) => (
                <Card key={item.id} className="border-brand/20">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <Badge variant={typeVariantMap[item.type] || 'muted'}>{item.type}</Badge>
                    {item.rank_score != null && (
                      <span className="text-xs text-muted">score: {item.rank_score.toFixed(3)}</span>
                    )}
                  </div>
                  <h4 className="text-base font-semibold text-ink">{item.title}</h4>
                  <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-ink-2">{item.body}</p>
                </Card>
              ))}
              {recallResult.memory_pack_text && (
                <details className="group mt-4">
                  <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
                    Show memory pack text
                  </summary>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(recallResult.memory_pack_text);
                        toast('success', 'Memory pack copied');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-line bg-bg-2 p-5 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap">
                    {recallResult.memory_pack_text}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── Inbox ─────────────────────────────────── */}
        <div className="mt-10">
          <div className="mb-5">
            <h2 className="flex items-center gap-2.5 text-xl font-semibold">
              <Inbox className="h-5 w-5 text-violet" />
              Inbox
              {inboxTotal > 0 && (
                <Badge variant="violet">{inboxTotal}</Badge>
              )}
            </h2>
            <p className="mt-1.5 text-sm text-ink-2">
              Captured data awaiting your review
            </p>
          </div>
          {inboxLoading ? (
            <SkeletonTable rows={2} />
          ) : inboxItems.length === 0 ? (
            <Card className="py-10 text-center">
              <Inbox className="mx-auto mb-3 h-8 w-8 text-muted" />
              <p className="text-sm text-ink-2">No inbox items yet.</p>
              <p className="mt-1 text-xs text-muted">Captured data will appear here for review.</p>
            </Card>
          ) : (
            <div className="space-y-5">
              {inboxItems.map((item) => {
                const isFailed = item.suggested_content.startsWith('[Gemini extraction failed:');
                return (
                  <Card key={item.id} className={isFailed ? 'border-warn/25' : 'border-violet/20'}>
                    {/* Header: type + status badges */}
                    <div className="mb-4 flex flex-wrap items-center gap-2.5">
                      <Badge variant={typeVariantMap[item.suggested_type] || 'muted'}>
                        {item.suggested_type}
                      </Badge>
                      <Badge variant={item.status === 'pending' ? 'warn' : 'muted'}>
                        {item.status}
                      </Badge>
                      {isFailed && (
                        <Badge variant="err">extraction failed</Badge>
                      )}
                    </div>

                    {/* Title */}
                    {item.suggested_title && (
                      <h4 className="mb-2 text-base font-semibold leading-snug text-ink">
                        {item.suggested_title}
                      </h4>
                    )}

                    {/* Content: failure state or normal */}
                    {isFailed ? (
                      <div className="space-y-4">
                        {/* Warning banner */}
                        <div className="flex items-start gap-3.5 rounded-xl border border-warn/20 bg-warn/[0.06] p-4">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/15">
                            <AlertTriangle className="h-5 w-5 text-warn" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-warn">Extraction failed — raw capture preserved</p>
                            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                              The extractor couldn&apos;t parse this capture. You can edit and approve as a raw note, or reject it.
                            </p>
                          </div>
                        </div>

                        {/* Expandable raw content */}
                        <details className="group">
                          <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
                            View raw captured content
                          </summary>
                          <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-line bg-bg-2 p-5 font-mono text-xs leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                            {item.suggested_content.replace(/^\[Gemini extraction failed: [^\]]*\]\n*/, '')}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-ink-2">
                        {item.suggested_content}
                      </p>
                    )}

                    {/* Footer: metadata + actions */}
                    <div className="mt-5 border-t border-line/50 pt-4">
                      <div className="mb-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted">
                          <span>Confidence</span>
                          <span>{(item.confidence_score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-bg-2">
                          <div className="h-full rounded-full bg-violet" style={{ width: `${Math.round(item.confidence_score * 100)}%` }} />
                        </div>
                      </div>
                      {item.status === 'pending' && (
                        <div className="flex flex-wrap gap-3">
                          <Button onClick={() => handleApproveInbox(item.id)}>
                            <CheckCircle className="h-4 w-4" />
                            {isFailed ? 'Approve as raw note' : 'Approve'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setApprovingItem(item);
                              setApproveType(item.suggested_type || 'note');
                              setApproveTitle(item.suggested_title || '');
                              setApproveContent(item.suggested_content || '');
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit & Approve
                          </Button>
                          <Button variant="ghost" onClick={() => handleRejectInbox(item.id)}>
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={showCreateMem} onClose={() => setShowCreateMem(false)} title="Add memory card">
          <form onSubmit={handleCreateMemory} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Type</label>
              <select
                value={memType}
                onChange={(e) => setMemType(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Title</label>
              <Input required value={memTitle} onChange={(e) => setMemTitle(e.target.value)} placeholder="e.g. Use magic-link auth" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Body</label>
              <textarea
                required
                value={memBody}
                onChange={(e) => setMemBody(e.target.value)}
                placeholder="Describe the decision, finding, or note..."
                rows={4}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brand/50"
              />
            </div>
            <Button type="submit" loading={creatingMem} className="w-full">Create memory</Button>
          </form>
        </Dialog>

        <Dialog open={!!editingMemory} onClose={() => setEditingMemory(null)} title="Edit memory">
          <form onSubmit={handleUpdateMemory} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Type</label>
              <select
                value={editMemType}
                onChange={(e) => setEditMemType(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Title</label>
              <Input required value={editMemTitle} onChange={(e) => setEditMemTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Body</label>
              <textarea
                required
                value={editMemBody}
                onChange={(e) => setEditMemBody(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brand/50"
              />
            </div>
            <Button type="submit" loading={savingMemory} className="w-full">Save changes</Button>
          </form>
        </Dialog>

        <Dialog open={!!approvingItem} onClose={() => setApprovingItem(null)} title="Edit & approve inbox item">
          <form onSubmit={handleApproveInboxWithEdits} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Type</label>
              <select
                value={approveType}
                onChange={(e) => setApproveType(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Title</label>
              <Input value={approveTitle} onChange={(e) => setApproveTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Content</label>
              <textarea
                required
                value={approveContent}
                onChange={(e) => setApproveContent(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brand/50"
              />
            </div>
            <Button type="submit" loading={approvingEdited} className="w-full">Approve item</Button>
          </form>
        </Dialog>

        <Dialog open={!!deleteMemoryTarget} onClose={() => setDeleteMemoryTarget(null)} title="Delete memory">
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Delete <strong className="text-ink">{deleteMemoryTarget?.title || 'this memory'}</strong>?
            </p>
            <p className="text-sm text-err">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteMemoryTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-err text-white hover:bg-err/90"
                onClick={async () => {
                  if (!deleteMemoryTarget) return;
                  await handleDeleteMemory(deleteMemoryTarget.id);
                  setDeleteMemoryTarget(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }

  // ── Projects List View ────────────────────────────────
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Projects</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : projectList.length === 0 ? (
        <Card className="py-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="mb-4 text-sm text-ink-2">No projects yet. Create your first one.</p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create project
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((p) => (
            <Card
              key={p.id}
              hover
              className="group relative cursor-pointer"
              onClick={() => openProject(p)}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mb-3">
                <Badge variant="brand">{p.memory_count ?? 0} memories</Badge>
              </div>
              {p.description && (
                <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-ink-2">{p.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
              <button
                title="Edit project"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingProject(p);
                  setEditProjectName(p.name);
                  setEditProjectDesc(p.description || '');
                }}
                className="absolute right-10 top-3 rounded p-1 text-muted opacity-0 transition-all hover:bg-brand/10 hover:text-brand group-hover:opacity-100"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                title="Delete project"
                onClick={(e) => { e.stopPropagation(); setDeleteProjectTarget(p); }}
                className="absolute right-3 top-3 rounded p-1 text-muted opacity-0 transition-all hover:bg-err/10 hover:text-err group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Create project">
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <Input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. webapp" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional description" />
          </div>
          <Button type="submit" loading={creating} className="w-full">Create project</Button>
        </form>
      </Dialog>

      <Dialog open={!!editingProject} onClose={() => setEditingProject(null)} title="Edit project">
        <form onSubmit={handleUpdateProject} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <Input required value={editProjectName} onChange={(e) => setEditProjectName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
            <Input value={editProjectDesc} onChange={(e) => setEditProjectDesc(e.target.value)} />
          </div>
          <Button type="submit" loading={savingProject} className="w-full">Save changes</Button>
        </form>
      </Dialog>

      <Dialog open={!!deleteProjectTarget} onClose={() => setDeleteProjectTarget(null)} title="Delete project">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Delete <strong className="text-ink">{deleteProjectTarget?.name}</strong>?
          </p>
          <p className="text-sm text-err">This action will remove all related memories and cannot be undone.</p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteProjectTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-err text-white hover:bg-err/90"
              onClick={async () => {
                if (!deleteProjectTarget) return;
                await handleDeleteProject(deleteProjectTarget.id);
                setDeleteProjectTarget(null);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
