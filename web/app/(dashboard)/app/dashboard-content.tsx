'use client';

import { useEffect, useState } from 'react';
import { projects, memories, type Project, type Memory, ApiError } from '@/lib/api';
import { MEMORY_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonCard } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import {
  Plus,
  Trash2,
  FolderOpen,
  ChevronRight,
  Brain,
  ArrowLeft,
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
    try {
      const data = await memories.list(project.id);
      setMemoryList(data);
    } catch {
      toast('error', 'Failed to load memories');
    } finally {
      setMemLoading(false);
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
