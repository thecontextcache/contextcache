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
  type InboxList,
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

  // ── Project Detail View ───────────────────────────────
  if (selectedProject) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => { setSelectedProject(null); setMemoryList([]); }}
          className="mb-4 flex items-center gap-1 text-sm text-ink-2 transition-colors hover:text-ink"
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
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : memoryList.length === 0 ? (
          <Card className="py-12 text-center">
            <Brain className="mx-auto mb-3 h-10 w-10 text-muted" />
            <p className="text-sm text-ink-2">No memories yet. Add your first memory card.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {memoryList.map((m) => (
              <Card key={m.id} hover className="group relative">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={typeVariantMap[m.type] || 'muted'}>{m.type}</Badge>
                  <span className="text-xs text-muted">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mb-1 font-semibold text-ink">{m.title}</h3>
                <p className="line-clamp-3 text-sm text-ink-2">{m.body}</p>
                <button
                  onClick={() => handleDeleteMemory(m.id)}
                  className="absolute right-3 top-3 rounded p-1 text-muted opacity-0 transition-all hover:bg-err/10 hover:text-err group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            ))}
          </div>
        )}

        {/* ── Recall Search ─────────────────────────── */}
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Search className="h-5 w-5 text-brand" />
            Recall
          </h2>
          <form onSubmit={handleRecall} className="flex gap-2">
            <Input
              value={recallQuery}
              onChange={(e) => setRecallQuery(e.target.value)}
              placeholder="Ask the project brain..."
              className="flex-1"
            />
            <Button type="submit" loading={recalling} size="sm">
              Search
            </Button>
          </form>
          {recallResult && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted">
                {recallResult.items.length} result{recallResult.items.length !== 1 ? 's' : ''} for &quot;{recallResult.query}&quot;
              </p>
              {recallResult.items.map((item) => (
                <Card key={item.id} className="border-brand/20">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={typeVariantMap[item.type] || 'muted'}>{item.type}</Badge>
                    {item.rank_score != null && (
                      <span className="text-xs text-muted">score: {item.rank_score.toFixed(3)}</span>
                    )}
                  </div>
                  <h4 className="font-semibold text-ink">{item.title}</h4>
                  <p className="mt-1 line-clamp-3 text-sm text-ink-2">{item.body}</p>
                </Card>
              ))}
              {recallResult.memory_pack_text && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted hover:text-ink-2">
                    Show memory pack text
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-line bg-bg-2 p-4 font-mono text-xs text-ink-2">
                    {recallResult.memory_pack_text}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── Inbox ─────────────────────────────────── */}
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Inbox className="h-5 w-5 text-violet" />
            Inbox
            {inboxTotal > 0 && (
              <Badge variant="violet">{inboxTotal}</Badge>
            )}
          </h2>
          {inboxLoading ? (
            <SkeletonTable rows={2} />
          ) : inboxItems.length === 0 ? (
            <Card className="py-6 text-center">
              <p className="text-sm text-muted">No inbox items. Captured data will appear here for review.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {inboxItems.map((item) => (
                <Card key={item.id} className="border-violet/20">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={typeVariantMap[item.suggested_type] || 'muted'}>
                      {item.suggested_type}
                    </Badge>
                    <span className="text-xs text-muted">
                      confidence: {(item.confidence_score * 100).toFixed(0)}%
                    </span>
                    <Badge variant={item.status === 'pending' ? 'warn' : 'muted'}>
                      {item.status}
                    </Badge>
                  </div>
                  {item.suggested_title && (
                    <h4 className="font-semibold text-ink">{item.suggested_title}</h4>
                  )}

                  {/* Handle extraction failure display */}
                  {item.suggested_content.startsWith('[Gemini extraction failed:') ? (
                    <div className="mt-2">
                      <div className="flex items-start gap-2 rounded-lg border border-warn/20 bg-warn/10 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                        <div>
                          <p className="text-xs font-medium text-warn">Extraction failed — raw capture preserved</p>
                          <p className="mt-0.5 text-xs text-warn/70">
                            The AI couldn&apos;t process this capture. You can approve it as a raw note or reject it.
                          </p>
                        </div>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted hover:text-ink-2">
                          Show raw content
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-line bg-bg-2 p-3 font-mono text-xs text-ink-2 whitespace-pre-wrap">
                          {item.suggested_content.replace(/^\[Gemini extraction failed: [^\]]*\]\n*/, '')}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <p className="mt-1 line-clamp-3 text-sm text-ink-2">{item.suggested_content}</p>
                  )}
                  {item.status === 'pending' && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => handleApproveInbox(item.id)}>
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRejectInbox(item.id)}>
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((p) => (
            <Card
              key={p.id}
              hover
              className="group relative cursor-pointer"
              onClick={() => openProject(p)}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-ink">{p.name}</h3>
                <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </div>
              {p.description && (
                <p className="mb-2 line-clamp-2 text-sm text-ink-2">{p.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
                {p.memory_count !== undefined && (
                  <span>{p.memory_count} memories</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
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
    </div>
  );
}
