'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { projects, memories, type Project, type Memory, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshCw, Brain, Sparkles, X as XIcon, Pause, Play, Info } from 'lucide-react';

type NodeType = 'project' | 'decision' | 'finding' | 'snippet' | 'note' | 'issue' | 'context' | 'code' | 'todo';

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  radius: number;
  data?: Project | Memory;
}

interface GraphEdge {
  source: string;
  target: string;
}

type BrainWorkerInMessage =
  | {
      type: 'INIT_GRAPH';
      nodes: Array<{ id: string; x: number; y: number; radius: number }>;
      edges: Array<{ source: string; target: string }>;
    }
  | { type: 'PAUSE_LAYOUT' }
  | { type: 'RESUME_LAYOUT' }
  | { type: 'PIN_NODE'; id: string; x: number; y: number }
  | { type: 'UNPIN_NODE'; id: string }
  | { type: 'KICK'; alpha?: number };

type BrainWorkerOutMessage =
  | { type: 'POSITIONS'; nodes: Array<{ id: string; x: number; y: number }> }
  | { type: 'COOLED' };

const TYPE_ORDER: NodeType[] = [
  'project',
  'decision',
  'issue',
  'finding',
  'snippet',
  'note',
  'context',
  'code',
  'todo',
];

const DEFAULT_NODE_COLORS: Record<NodeType, string> = {
  project: '#0ea5e9',
  decision: '#0ea5e9',
  finding: '#6366f1',
  snippet: '#22c55e',
  code: '#0f766e',
  note: '#eab308',
  issue: '#ef4444',
  todo: '#f97316',
  context: '#06b6d4',
};

const REFRESH_INTERVAL = 30000;
const SAME_TYPE_EDGE_NEIGHBORS = 2;

type BadgeVariant = 'brand' | 'violet' | 'ok' | 'warn' | 'err' | 'muted';

function typeVariant(type: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    project: 'brand',
    decision: 'brand',
    finding: 'violet',
    snippet: 'ok',
    code: 'ok',
    note: 'warn',
    issue: 'err',
    todo: 'err',
    context: 'muted',
  };
  return map[type] || 'muted';
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash *= 16777619;
  }
  return (hash >>> 0) / 4294967295;
}

function initialPosition(type: NodeType, key: string, anchor?: { x: number; y: number }) {
  const ringIndex = Math.max(0, TYPE_ORDER.indexOf(type));
  const baseRadius = type === 'project' ? 110 : 180 + ringIndex * 72;
  const seed = hashString(key);
  const angle = seed * Math.PI * 2;
  const jitter = (hashString(`${key}:j`) - 0.5) * 22;
  const x = Math.cos(angle) * (baseRadius + jitter);
  const y = Math.sin(angle) * (baseRadius + jitter);

  if (!anchor) return { x, y };
  return {
    x: anchor.x + Math.cos(angle) * (45 + (hashString(`${key}:a`) - 0.5) * 35),
    y: anchor.y + Math.sin(angle) * (45 + (hashString(`${key}:b`) - 0.5) * 35),
  };
}

export function BrainContentWebGL() {
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const sigmaRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);
  const layoutStartRef = useRef<number>(0);
  const loadStartRef = useRef<number>(0);

  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const activeTypesRef = useRef<Set<string>>(new Set(Object.keys(DEFAULT_NODE_COLORS).filter((t) => t !== 'project')));
  const searchQueryRef = useRef<string>('');

  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ projects: 0, memories: 0 });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(Object.keys(DEFAULT_NODE_COLORS).filter((t) => t !== 'project'))
  );
  const [telemetry, setTelemetry] = useState({
    loadMs: 0,
    layoutMs: 0,
    simulation: 'worker' as 'worker' | 'none',
  });

  useEffect(() => {
    activeTypesRef.current = activeTypes;
  }, [activeTypes]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const [nodeColors, setNodeColors] = useState<Record<NodeType, string>>(DEFAULT_NODE_COLORS);

  useEffect(() => {
    const applyNodeColors = () => {
      if (typeof window === 'undefined') return;
      const style = getComputedStyle(document.documentElement);
      const out = { ...DEFAULT_NODE_COLORS };
      for (const type of Object.keys(DEFAULT_NODE_COLORS) as NodeType[]) {
        const css = style.getPropertyValue(`--cc-graph-node-${type}`).trim();
        if (css) out[type] = css;
      }
      setNodeColors(out);
    };

    applyNodeColors();
    const observer = new MutationObserver(applyNodeColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    for (const node of nodesRef.current) {
      if (graph.hasNode(node.id)) {
        graph.setNodeAttribute(node.id, 'color', nodeColors[node.type]);
      }
    }
    if (sigmaRef.current?.refresh) sigmaRef.current.refresh();
  }, [nodeColors]);

  function postToWorker(message: BrainWorkerInMessage) {
    if (!workerRef.current) return;
    workerRef.current.postMessage(message);
  }

  function updateVisibility() {
    const graph = graphRef.current;
    if (!graph) return;
    for (const node of nodesRef.current) {
      const visible = node.type === 'project' || activeTypesRef.current.has(node.type);
      if (graph.hasNode(node.id)) {
        graph.setNodeAttribute(node.id, 'hidden', !visible);
      }
    }
    if (sigmaRef.current?.refresh) sigmaRef.current.refresh();
  }

  function syncGraphToWorker() {
    if (!workerRef.current) return;
    layoutStartRef.current = performance.now();
    postToWorker({
      type: 'INIT_GRAPH',
      nodes: nodesRef.current.map((n) => ({ id: n.id, x: n.x, y: n.y, radius: n.radius })),
      edges: edgesRef.current.map((e) => ({ source: e.source, target: e.target })),
    });
    if (paused) postToWorker({ type: 'PAUSE_LAYOUT' });
  }

  function rebuildGraph() {
    const graph = graphRef.current;
    if (!graph) return;

    graph.clear();

    for (const node of nodesRef.current) {
      const visible = node.type === 'project' || activeTypesRef.current.has(node.type);
      graph.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: Math.max(2, node.radius * 0.35),
        color: nodeColors[node.type],
        type: node.type,
        hidden: !visible,
      });
    }

    for (const edge of edgesRef.current) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        const id = `${edge.source}->${edge.target}`;
        if (!graph.hasEdge(id)) {
          graph.addEdgeWithKey(id, edge.source, edge.target, {
            size: 0.45,
            color: 'rgba(148,163,184,0.28)',
          });
        }
      }
    }

    if (sigmaRef.current?.refresh) sigmaRef.current.refresh();
  }

  function computeSearchResults(query: string): GraphNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodesRef.current
      .filter((n) => (n.type === 'project' || activeTypesRef.current.has(n.type)) && n.label.toLowerCase().includes(q))
      .sort((a, b) => {
        const ai = a.label.toLowerCase().indexOf(q);
        const bi = b.label.toLowerCase().indexOf(q);
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }

  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);

  function focusNode(node: GraphNode) {
    setSelectedNode(node);
    const sigma = sigmaRef.current;
    if (!sigma?.getCamera) return;
    const camera = sigma.getCamera();
    camera.animate({ x: node.x, y: node.y, ratio: node.type === 'project' ? 0.95 : 0.75 }, { duration: 240 });
  }

  const loadData = useCallback(async () => {
    loadStartRef.current = performance.now();
    setLoading(true);

    try {
      const projectList = await projects.list();
      if (projectList.length === 0) {
        nodesRef.current = [];
        edgesRef.current = [];
        setIsEmpty(true);
        setStats({ projects: 0, memories: 0 });
        rebuildGraph();
        setLoading(false);
        return;
      }

      const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]));
      const newNodes: GraphNode[] = [];
      const newEdges: GraphEdge[] = [];
      let memCount = 0;

      const memoryResults = await Promise.all(
        projectList.map(async (proj) => {
          try {
            const mems = await memories.list(proj.id);
            return { proj, mems };
          } catch {
            return { proj, mems: [] as Memory[] };
          }
        })
      );

      for (const { proj, mems } of memoryResults) {
        const pId = `proj-${proj.id}`;
        const existing = existingMap.get(pId);
        const pSeed = initialPosition('project', pId);

        const pNode: GraphNode = {
          id: pId,
          label: proj.name,
          type: 'project',
          x: existing?.x ?? pSeed.x,
          y: existing?.y ?? pSeed.y,
          radius: 22,
          data: proj,
        };
        newNodes.push(pNode);

        for (const mem of mems) {
          const mId = `mem-${mem.id}`;
          const mExisting = existingMap.get(mId);
          const t = (mem.type || 'note') as NodeType;
          const seed = initialPosition(t, mId, { x: pNode.x, y: pNode.y });
          memCount += 1;

          newNodes.push({
            id: mId,
            label: mem.title ?? `Memory #${mem.id}`,
            type: t,
            x: mExisting?.x ?? seed.x,
            y: mExisting?.y ?? seed.y,
            radius: mem.type === 'snippet' || mem.type === 'code' ? 12 : 8 + hashString(`${mId}:r`) * 4,
            data: mem,
          });

          newEdges.push({ source: pId, target: mId });
        }
      }

      // Same-type links per project
      const byProject = new Map<string, GraphNode[]>();
      for (const e of newEdges) {
        const n = newNodes.find((node) => node.id === e.target);
        if (!n) continue;
        const arr = byProject.get(e.source) ?? [];
        arr.push(n);
        byProject.set(e.source, arr);
      }
      for (const [, group] of byProject) {
        const byType = new Map<NodeType, GraphNode[]>();
        for (const node of group) {
          const arr = byType.get(node.type) ?? [];
          arr.push(node);
          byType.set(node.type, arr);
        }
        for (const [, typed] of byType) {
          typed.sort((a, b) => a.id.localeCompare(b.id));
          for (let i = 0; i < typed.length; i++) {
            for (let j = i + 1; j < Math.min(typed.length, i + 1 + SAME_TYPE_EDGE_NEIGHBORS); j++) {
              newEdges.push({ source: typed[i].id, target: typed[j].id });
            }
          }
        }
      }

      nodesRef.current = newNodes;
      edgesRef.current = newEdges;

      setIsEmpty(false);
      setStats({ projects: projectList.length, memories: memCount });
      setLastRefresh(new Date());
      rebuildGraph();
      syncGraphToWorker();

      if (searchQueryRef.current.trim()) {
        setSearchResults(computeSearchResults(searchQueryRef.current));
      }
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to load brain data');
    } finally {
      setTelemetry((prev) => ({
        ...prev,
        loadMs: Math.round(performance.now() - loadStartRef.current),
      }));
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let disposed = false;

    const initSigma = async () => {
      try {
        const sigmaMod = await import('sigma');
        const graphMod = await import('graphology');
        if (disposed || !containerRef.current) return;

        const SigmaCtor = (sigmaMod as any).default || (sigmaMod as any).Sigma;
        const GraphCtor = (graphMod as any).default || (graphMod as any).Graph;

        const graph = new GraphCtor();
        graphRef.current = graph;

        const sigma = new SigmaCtor(graph, containerRef.current, {
          minCameraRatio: 0.08,
          maxCameraRatio: 4,
          renderLabels: true,
          labelDensity: 1.1,
          labelGridCellSize: 80,
          labelRenderedSizeThreshold: 10,
          defaultEdgeType: 'line',
          allowInvalidContainer: true,
        });

        sigmaRef.current = sigma;

        sigma.on('clickNode', (payload: any) => {
          const id = String(payload.node);
          const node = nodesRef.current.find((n) => n.id === id) || null;
          if (node) setSelectedNode(node);
        });

        sigma.on('clickStage', () => {
          setSelectedNode(null);
        });

        await loadData();
      } catch {
        setTelemetry((prev) => ({ ...prev, simulation: 'none' }));
      }
    };

    initSigma();

    return () => {
      disposed = true;
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      graphRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./brain-sim.worker.ts', import.meta.url));
      workerRef.current = worker;
      setTelemetry((prev) => ({ ...prev, simulation: 'worker' }));
      if (nodesRef.current.length > 0) {
        syncGraphToWorker();
      }

      worker.onmessage = (event: MessageEvent<BrainWorkerOutMessage>) => {
        const data = event.data;
        if (data.type === 'POSITIONS') {
          const graph = graphRef.current;
          if (!graph) return;
          for (const p of data.nodes) {
            const node = nodesRef.current.find((n) => n.id === p.id);
            if (node) {
              node.x = p.x;
              node.y = p.y;
            }
            if (graph.hasNode(p.id)) {
              graph.setNodeAttribute(p.id, 'x', p.x);
              graph.setNodeAttribute(p.id, 'y', p.y);
            }
          }
          if (sigmaRef.current?.refresh) sigmaRef.current.refresh();
        } else if (data.type === 'COOLED') {
          if (layoutStartRef.current > 0) {
            setTelemetry((prev) => ({
              ...prev,
              layoutMs: Math.round(performance.now() - layoutStartRef.current),
            }));
          }
        }
      };

      worker.onerror = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
        setTelemetry((prev) => ({ ...prev, simulation: 'none' }));
      };
    } catch {
      setTelemetry((prev) => ({ ...prev, simulation: 'none' }));
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      postToWorker({ type: paused ? 'PAUSE_LAYOUT' : 'RESUME_LAYOUT' });
    }
  }, [paused]);

  useEffect(() => {
    updateVisibility();
    if (searchQuery.trim()) {
      setSearchResults(computeSearchResults(searchQuery));
    }
  }, [activeTypes, searchQuery]);

  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brain</h1>
          <p className="mt-1 text-sm text-ink-2">Neural graph of your project knowledge (WebGL).</p>
          {!isEmpty && (
            <p className="mt-1 text-xs text-muted">
              {telemetry.simulation} sim · load {telemetry.loadMs} ms · layout {telemetry.layoutMs} ms
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isEmpty && (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="text-xs text-ink-2">
                {stats.projects} project{stats.projects !== 1 ? 's' : ''} · {stats.memories} memor{stats.memories !== 1 ? 'ies' : 'y'}
              </span>
            </div>
          )}
          <span className="text-xs text-muted">{lastRefresh.toLocaleTimeString()}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPaused((v) => !v)}
            title={paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => loadData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {!isEmpty && (
        <div className="mb-3">
          <div className="relative max-w-md">
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchResults(computeSearchResults(e.target.value));
              }}
              placeholder="Search graph nodes..."
              className="pr-20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted hover:bg-bg-2 hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-w-md rounded-lg border border-line bg-panel p-1 shadow-panel">
              {searchResults.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    focusNode(node);
                    setSearchResults([]);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-bg-2"
                >
                  <span className="truncate text-ink">{node.label}</span>
                  <span className="ml-3 shrink-0 capitalize text-muted">{node.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(nodeColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] capitalize text-muted">{type}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(DEFAULT_NODE_COLORS)
              .filter((type) => type !== 'project')
              .map((type) => {
                const active = activeTypes.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setActiveTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      });
                    }}
                    className={`rounded-full border px-2 py-1 text-[10px] capitalize transition-colors ${
                      active
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-line bg-bg-2 text-muted hover:text-ink-2'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
              <Info className="h-3 w-3" />
              WebGL mode for large graph volumes (10k+)
            </span>
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-lg border border-line" style={{ minHeight: '70vh' }}>
        {loading && nodesRef.current.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Brain className="h-10 w-10 animate-pulse text-brand/50" />
              <p className="text-sm text-muted">Loading neural graph…</p>
            </div>
          </div>
        )}

        {isEmpty && !loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <Brain className="h-20 w-20 animate-pulse text-brand/20" />
              <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-violet/50" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-ink/80">Your brain is empty</h2>
            <p className="mb-4 max-w-sm text-sm text-ink-2">Create a project and add memories to see it grow.</p>
            <Badge variant="violet">
              <Sparkles className="mr-1 h-3 w-3" />
              Waiting for data
            </Badge>
          </div>
        )}

        <div ref={containerRef} className="h-full w-full" />
      </div>

      {selectedNode && (
        <Card className="absolute right-4 top-20 z-20 w-72 animate-fade-in shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <Badge variant={typeVariant(selectedNode.type)} className="capitalize">
              {selectedNode.type}
            </Badge>
            <button
              onClick={() => setSelectedNode(null)}
              className="rounded p-1 text-muted transition-colors hover:text-ink"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <h3 className="mb-2 font-semibold text-ink">{selectedNode.label}</h3>

          {selectedNode.data && 'description' in selectedNode.data && selectedNode.data.description && (
            <p className="mb-2 text-xs text-ink-2">{selectedNode.data.description}</p>
          )}

          {selectedNode.data && ('body' in selectedNode.data || 'content' in selectedNode.data) && (
            <p className="mb-3 line-clamp-4 text-xs text-ink-2">
              {((selectedNode.data as Memory).body || (selectedNode.data as Memory).content || '').slice(0, 200)}
            </p>
          )}

          {selectedNode.data && 'tags' in selectedNode.data && (selectedNode.data as Memory).tags && (
            <div className="mb-3 flex flex-wrap gap-1">
              {((selectedNode.data as Memory).tags ?? []).map((tag) => (
                <span key={tag} className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {selectedNode.data && 'memory_count' in selectedNode.data && (
            <p className="mb-2 text-xs text-muted">{(selectedNode.data as Project).memory_count ?? 0} memories</p>
          )}

          {selectedNode.data && 'created_at' in selectedNode.data && (
            <p className="text-[10px] text-muted">
              Created {new Date(selectedNode.data.created_at).toLocaleDateString()}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
