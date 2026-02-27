'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { projects, memories, type Project, type Memory, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshCw, Brain, Sparkles, X as XIcon, Pause, Play, Info } from 'lucide-react';
import { BrainContent } from './brain-content';

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
const MOBILE_FALLBACK_NODE_THRESHOLD = 3000;
const LOW_MEMORY_GB = 4;
const LOD_HIDE_EDGES_RATIO = 1.35;
const LOD_EDGE_LIMIT = 12000;
const MEMORY_FETCH_CONCURRENCY = 10;
const MEMORY_FETCH_TIMEOUT_MS = 12000;

type BadgeVariant = 'brand' | 'violet' | 'ok' | 'warn' | 'err' | 'muted';

declare global {
  interface Window {
    __brainGraphDebug?: {
      getMetrics: () => Record<string, unknown>;
      getSnapshot: () => Record<string, unknown>;
      forceReload: () => Promise<void>;
    };
  }
}

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

function normalizeNodeType(value: string | null | undefined): NodeType {
  if (!value) return 'note';
  const v = value.toLowerCase();
  const allowed = new Set<NodeType>(['project', 'decision', 'finding', 'snippet', 'note', 'issue', 'context', 'code', 'todo']);
  return allowed.has(v as NodeType) ? (v as NodeType) : 'note';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function createSyntheticGraph(nodeCount: number, edgeCount: number) {
  const typePool: NodeType[] = ['decision', 'finding', 'snippet', 'note', 'issue', 'context', 'code', 'todo'];
  const projectCount = Math.max(1, Math.ceil(nodeCount / 850));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (let i = 0; i < projectCount; i++) {
    const id = `proj-synth-${i + 1}`;
    const p = initialPosition('project', id);
    nodes.push({ id, label: `Synthetic Project ${i + 1}`, type: 'project', x: p.x, y: p.y, radius: 22 });
  }

  for (let i = 0; i < nodeCount; i++) {
    const type = typePool[i % typePool.length];
    const projectIndex = i % projectCount;
    const parent = nodes[projectIndex];
    const id = `mem-synth-${i + 1}`;
    const p = initialPosition(type, id, { x: parent.x, y: parent.y });
    nodes.push({
      id,
      label: `Synthetic ${type} #${i + 1}`,
      type,
      x: p.x,
      y: p.y,
      radius: type === 'snippet' || type === 'code' ? 12 : 8 + hashString(`${id}:r`) * 4,
    });
    edges.push({ source: parent.id, target: id });
  }

  const memoryNodes = nodes.filter((n) => n.type !== 'project');
  let idx = 0;
  while (edges.length < edgeCount && memoryNodes.length > 2) {
    const a = memoryNodes[idx % memoryNodes.length];
    const b = memoryNodes[(idx * 17 + 13) % memoryNodes.length];
    if (a.id !== b.id) edges.push({ source: a.id, target: b.id });
    idx += 1;
  }

  return {
    nodes,
    edges,
    stats: {
      projects: projectCount,
      memories: memoryNodes.length,
    },
  };
}

export function BrainContentWebGL() {
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const sigmaRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);
  const contextLostCleanupRef = useRef<(() => void) | null>(null);
  const layoutStartRef = useRef<number>(0);
  const loadStartRef = useRef<number>(0);

  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const activeTypesRef = useRef<Set<string>>(new Set(Object.keys(DEFAULT_NODE_COLORS).filter((t) => t !== 'project')));
  const searchQueryRef = useRef<string>('');
  const keyboardNodeIndexRef = useRef<number>(-1);

  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusMode, setFocusMode] = useState(false);
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
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(new Set());
  const [mobileFallback, setMobileFallback] = useState(false);
  const [allowFullGraphOnMobile, setAllowFullGraphOnMobile] = useState(false);
  const [selectedFromList, setSelectedFromList] = useState<string | null>(null);
  const metricsRef = useRef({
    fps: 0,
    p95FrameMs: 0,
    clickLatencyMs: 0,
    searchFocusLatencyMs: 0,
    nodeCount: 0,
    edgeCount: 0,
    renderer: 'webgl',
  });
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTsRef = useRef<number>(0);
  const clickStartRef = useRef<number>(0);
  const searchStartRef = useRef<number>(0);
  const perfRenderTsRef = useRef<number>(0);
  const [perfView, setPerfView] = useState({
    fps: 0,
    p95FrameMs: 0,
    clickLatencyMs: 0,
    searchFocusLatencyMs: 0,
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
    const focusSet = new Set<string>();
    if (focusMode && selectedNode) {
      focusSet.add(selectedNode.id);
      for (const e of edgesRef.current) {
        if (e.source === selectedNode.id) focusSet.add(e.target);
        if (e.target === selectedNode.id) focusSet.add(e.source);
      }
    }
    for (const node of nodesRef.current) {
      const typeVisible = node.type === 'project' || activeTypesRef.current.has(node.type);
      const focusVisible = !focusMode || !selectedNode || focusSet.has(node.id) || node.type === 'project';
      const visible = typeVisible && focusVisible;
      if (graph.hasNode(node.id)) {
        graph.setNodeAttribute(node.id, 'hidden', !visible);
      }
    }
    graph.forEachEdge((edgeId: string) => {
      const [source, target] = graph.extremities(edgeId);
      const sourceVisible = graph.hasNode(source) ? !graph.getNodeAttribute(source, 'hidden') : false;
      const targetVisible = graph.hasNode(target) ? !graph.getNodeAttribute(target, 'hidden') : false;
      graph.setEdgeAttribute(edgeId, 'hidden', !(sourceVisible && targetVisible));
    });
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
        color: nodeColors[node.type] ?? nodeColors.note,
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
    if (searchStartRef.current > 0) {
      metricsRef.current.searchFocusLatencyMs = Math.round(performance.now() - searchStartRef.current);
      searchStartRef.current = 0;
    }
    setSelectedNode(node);
    const sigma = sigmaRef.current;
    if (!sigma?.getCamera) return;
    const camera = sigma.getCamera();
    camera.animate({ x: node.x, y: node.y, ratio: node.type === 'project' ? 0.95 : 0.75 }, { duration: 240 });
  }

  function getVisibleNodesForKeyboard() {
    return nodesRef.current
      .filter((n) => n.type === 'project' || activeTypesRef.current.has(n.type))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function panCamera(dx: number, dy: number) {
    const sigma = sigmaRef.current;
    if (!sigma?.getCamera) return;
    const camera = sigma.getCamera();
    const ratio = typeof camera.ratio === 'number' ? camera.ratio : 1;
    camera.animate(
      {
        x: camera.x + dx * ratio,
        y: camera.y + dy * ratio,
      },
      { duration: 120 }
    );
  }

  function zoomCamera(delta: number) {
    const sigma = sigmaRef.current;
    if (!sigma?.getCamera) return;
    const camera = sigma.getCamera();
    const nextRatio = Math.min(4, Math.max(0.08, camera.ratio * (delta > 0 ? 0.88 : 1.14)));
    camera.animate({ ratio: nextRatio }, { duration: 120 });
  }

  function resetCamera() {
    const sigma = sigmaRef.current;
    if (!sigma?.getCamera) return;
    const camera = sigma.getCamera();
    camera.animate({ x: 0, y: 0, ratio: 1 }, { duration: 180 });
  }

  function togglePinSelectedNode() {
    if (!selectedNode) return;
    const isPinned = pinnedNodeIds.has(selectedNode.id);
    const next = new Set(pinnedNodeIds);
    if (isPinned) {
      next.delete(selectedNode.id);
      postToWorker({ type: 'UNPIN_NODE', id: selectedNode.id });
    } else {
      next.add(selectedNode.id);
      postToWorker({ type: 'PIN_NODE', id: selectedNode.id, x: selectedNode.x, y: selectedNode.y });
    }
    setPinnedNodeIds(next);
  }

  const loadData = useCallback(async () => {
    loadStartRef.current = performance.now();
    setLoading(true);

    try {
      const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const useSynthetic = searchParams?.get('synthetic') === '1';
      if (useSynthetic) {
        const n = Number(searchParams?.get('nodes') ?? '10000');
        const e = Number(searchParams?.get('edges') ?? '30000');
        const synthetic = createSyntheticGraph(
          Math.max(100, Math.min(50000, Number.isFinite(n) ? n : 10000)),
          Math.max(100, Math.min(200000, Number.isFinite(e) ? e : 30000))
        );
        nodesRef.current = synthetic.nodes;
        edgesRef.current = synthetic.edges;
        setIsEmpty(false);
        setStats(synthetic.stats);
        setLastRefresh(new Date());
        metricsRef.current.nodeCount = synthetic.nodes.length;
        metricsRef.current.edgeCount = synthetic.edges.length;
        rebuildGraph();
        syncGraphToWorker();
        setLoading(false);
        return;
      }

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

      const memoryResults: Array<{ proj: Project; mems: Memory[] }> = [];
      let failedProjects = 0;
      for (let i = 0; i < projectList.length; i += MEMORY_FETCH_CONCURRENCY) {
        const batch = projectList.slice(i, i + MEMORY_FETCH_CONCURRENCY);
        const loaded = await Promise.all(
          batch.map(async (proj) => {
            try {
              const mems = await withTimeout(memories.list(proj.id), MEMORY_FETCH_TIMEOUT_MS);
              return { proj, mems };
            } catch {
              failedProjects += 1;
              return { proj, mems: [] as Memory[] };
            }
          })
        );
        memoryResults.push(...loaded);
      }
      if (failedProjects > 0) {
        setPartialLoadWarning(`Partial graph: ${failedProjects} project(s) timed out.`);
      } else {
        setPartialLoadWarning(null);
      }

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
          const t = normalizeNodeType(mem.type);
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
      metricsRef.current.nodeCount = newNodes.length;
      metricsRef.current.edgeCount = newEdges.length;

      setIsEmpty(false);
      setStats({ projects: projectList.length, memories: memCount });
      setLastRefresh(new Date());
      rebuildGraph();
      syncGraphToWorker();

      if (searchQueryRef.current.trim()) {
        setSearchResults(computeSearchResults(searchQueryRef.current));
      }
    } catch (err) {
      if (nodesRef.current.length === 0) {
        setIsEmpty(true);
      }
      if (!(err instanceof ApiError)) {
        const message = err instanceof Error ? err.message : 'Unknown graph runtime error';
        setFatalError(message);
      }
      setPartialLoadWarning('Graph loaded with errors. Some data may be missing.');
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
        if (typeof window !== 'undefined') {
          const c = document.createElement('canvas');
          const gl =
            c.getContext('webgl') ||
            (c.getContext('experimental-webgl' as never) as RenderingContext | null);
          if (!gl) {
            throw new Error('WebGL is not available in this browser/runtime');
          }
        }
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
          if (clickStartRef.current > 0) {
            metricsRef.current.clickLatencyMs = Math.round(performance.now() - clickStartRef.current);
            clickStartRef.current = 0;
          }
          const node = nodesRef.current.find((n) => n.id === id) || null;
          if (node) setSelectedNode(node);
        });

        sigma.on('downNode', () => {
          clickStartRef.current = performance.now();
        });

        sigma.on('clickStage', () => {
          setSelectedNode(null);
        });

        requestAnimationFrame(() => {
          const canvas = containerRef.current?.querySelector('canvas');
          if (!canvas) return;
          const onContextLost = (e: Event) => {
            e.preventDefault();
            setFatalError('WebGL context lost');
            toast('error', 'WebGL context lost. Falling back to Canvas renderer.');
          };
          canvas.addEventListener('webglcontextlost', onContextLost as EventListener, { passive: false });
          contextLostCleanupRef.current = () => {
            canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
          };
        });

        const camera = sigma.getCamera?.();
        if (camera?.on) {
          camera.on('updated', () => {
            const ratio = typeof camera.ratio === 'number' ? camera.ratio : 1;
            const hideEdges = ratio > LOD_HIDE_EDGES_RATIO && edgesRef.current.length > LOD_EDGE_LIMIT;
            const graph = graphRef.current;
            if (!graph) return;
            graph.forEachEdge((edgeId: string) => {
              graph.setEdgeAttribute(edgeId, 'hidden', hideEdges);
            });
          });
        }

        await loadData();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown WebGL initialization failure';
        setFatalError(message);
        setLoading(false);
        setTelemetry((prev) => ({ ...prev, simulation: 'none' }));
        toast('error', 'WebGL renderer failed. Falling back to Canvas renderer.');
      }
    };

    initSigma();

    return () => {
      disposed = true;
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      if (contextLostCleanupRef.current) {
        contextLostCleanupRef.current();
        contextLostCleanupRef.current = null;
      }
      graphRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fatalError) return;
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
  }, [fatalError]);

  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      if (lastFrameTsRef.current > 0) {
        const dt = ts - lastFrameTsRef.current;
        frameTimesRef.current.push(dt);
        if (frameTimesRef.current.length > 300) frameTimesRef.current.shift();
      }
      lastFrameTsRef.current = ts;
      if (frameTimesRef.current.length >= 20) {
        const sorted = [...frameTimesRef.current].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const avg = sorted.reduce((acc, n) => acc + n, 0) / sorted.length;
        metricsRef.current.p95FrameMs = Math.round(p95);
        metricsRef.current.fps = Math.round(1000 / Math.max(avg, 1));
      }
      if (ts - perfRenderTsRef.current > 1000) {
        perfRenderTsRef.current = ts;
        setPerfView({
          fps: metricsRef.current.fps,
          p95FrameMs: metricsRef.current.p95FrameMs,
          clickLatencyMs: metricsRef.current.clickLatencyMs,
          searchFocusLatencyMs: metricsRef.current.searchFocusLatencyMs,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const maybeSetMobileFallback = () => {
      if (typeof window === 'undefined') return;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const isMobileLayout = window.innerWidth < 900;
      const shouldFallback = isMobileLayout && memory <= LOW_MEMORY_GB && nodesRef.current.length > MOBILE_FALLBACK_NODE_THRESHOLD;
      setMobileFallback(shouldFallback);
    };
    maybeSetMobileFallback();
    window.addEventListener('resize', maybeSetMobileFallback);
    return () => window.removeEventListener('resize', maybeSetMobileFallback);
  }, [stats.memories]);

  useEffect(() => {
    window.__brainGraphDebug = {
      getMetrics: () => ({
        ...metricsRef.current,
        loadMs: telemetry.loadMs,
        layoutMs: telemetry.layoutMs,
      }),
      getSnapshot: () => ({
        nodeCount: nodesRef.current.length,
        edgeCount: edgesRef.current.length,
        selectedNode: selectedNode?.id ?? null,
        paused,
        mobileFallback,
      }),
      forceReload: async () => {
        await loadData();
      },
    };
    return () => {
      delete window.__brainGraphDebug;
    };
  }, [loadData, mobileFallback, paused, selectedNode?.id, telemetry.layoutMs, telemetry.loadMs]);

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
  }, [activeTypes, searchQuery, focusMode, selectedNode?.id]);

  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPaused(true);
    }
  }, []);

  const showMobileListFallback = mobileFallback && !allowFullGraphOnMobile;
  const listNodes = nodesRef.current
    .filter((n) => n.type === 'project' || activeTypes.has(n.type))
    .slice(0, 250);

  if (fatalError) {
    return (
      <div className="space-y-3">
        <Card className="border border-warn/30 bg-warn/10 p-3 text-sm text-ink-2">
          WebGL renderer failed ({fatalError}). Using Canvas fallback for this session.
        </Card>
        <BrainContent />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brain</h1>
          <p className="mt-1 text-sm text-ink-2">Neural graph of your project knowledge (WebGL).</p>
          {!isEmpty && (
            <p className="mt-1 text-xs text-muted">
              {telemetry.simulation} sim · load {telemetry.loadMs} ms · layout {telemetry.layoutMs} ms · fps {perfView.fps}
              {' '}· p95 {perfView.p95FrameMs} ms
            </p>
          )}
          {partialLoadWarning && (
            <p className="mt-1 text-xs text-warn">{partialLoadWarning}</p>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault();
                  searchStartRef.current = performance.now();
                  focusNode(searchResults[0]);
                  setSearchResults([]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearchQuery('');
                  setSearchResults([]);
                }
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
                    searchStartRef.current = performance.now();
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
            {showMobileListFallback && (
              <span className="inline-flex items-center gap-1 text-[10px] text-warn">
                <Info className="h-3 w-3" />
                Mobile-safe list fallback active
              </span>
            )}
            {selectedNode && (
              <button
                type="button"
                onClick={() => setFocusMode((v) => !v)}
                className={`rounded-full border px-2 py-1 text-[10px] transition-colors ${
                  focusMode
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-line bg-bg-2 text-muted hover:text-ink-2'
                }`}
              >
                {focusMode ? 'Focus: on' : 'Focus: off'}
              </button>
            )}
          </div>
        </div>
      )}

      {showMobileListFallback && (
        <Card className="mb-4 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Mobile-safe view</h3>
            <Button size="sm" variant="ghost" onClick={() => setAllowFullGraphOnMobile(true)}>
              Try full graph
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted">
            Full graph is disabled on this device due to memory/size constraints. Use list-first navigation.
          </p>
          <div className="max-h-72 overflow-auto rounded border border-line">
            {listNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  setSelectedFromList(node.id);
                  focusNode(node);
                }}
                className={`flex w-full items-center justify-between border-b border-line px-3 py-2 text-left text-xs hover:bg-bg-2 ${
                  selectedFromList === node.id ? 'bg-brand/10' : ''
                }`}
              >
                <span className="truncate pr-3">{node.label}</span>
                <span className="shrink-0 capitalize text-muted">{node.type}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!showMobileListFallback && (
      <div
        className="relative overflow-hidden rounded-lg border border-line"
        style={{ height: '70vh' }}
        role="application"
        aria-label="Brain graph of your project knowledge"
        aria-describedby="brain-graph-help"
      >
        <p id="brain-graph-help" className="sr-only">
          Use arrow keys to pan, plus or minus to zoom, tab to cycle nodes, enter to select, and escape to clear selection.
        </p>
        <p className="sr-only" aria-live="polite">
          Graph contains {stats.projects} projects and {stats.memories} memories.
        </p>
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

        <div
          ref={containerRef}
          className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              panCamera(0, -20);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              panCamera(0, 20);
              return;
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              panCamera(-20, 0);
              return;
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              panCamera(20, 0);
              return;
            }
            if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              zoomCamera(1);
              return;
            }
            if (e.key === '-' || e.key === '_') {
              e.preventDefault();
              zoomCamera(-1);
              return;
            }
            if (e.key === '0' || e.key === 'Home') {
              e.preventDefault();
              resetCamera();
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setSelectedNode(null);
              setSearchResults([]);
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              const visibleNodes = getVisibleNodesForKeyboard();
              if (visibleNodes.length === 0) return;
              const dir = e.shiftKey ? -1 : 1;
              keyboardNodeIndexRef.current =
                (keyboardNodeIndexRef.current + dir + visibleNodes.length) % visibleNodes.length;
              focusNode(visibleNodes[keyboardNodeIndexRef.current]);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const visibleNodes = getVisibleNodesForKeyboard();
              if (visibleNodes.length === 0) return;
              if (keyboardNodeIndexRef.current < 0) {
                keyboardNodeIndexRef.current = 0;
              }
              focusNode(visibleNodes[keyboardNodeIndexRef.current]);
            }
          }}
        />
      </div>
      )}

      <details className="mt-4 rounded border border-line bg-panel p-2 text-xs">
        <summary className="cursor-pointer text-ink-2">Accessible Node List (screen-reader and keyboard fallback)</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          {listNodes.slice(0, 120).map((node) => (
            <button
              key={`accessible-${node.id}`}
              type="button"
              onClick={() => focusNode(node)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-bg-2"
            >
              <span className="truncate pr-3">{node.label}</span>
              <span className="capitalize text-muted">{node.type}</span>
            </button>
          ))}
        </div>
      </details>

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
          <div className="mb-3 flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={togglePinSelectedNode}>
              {pinnedNodeIds.has(selectedNode.id) ? 'Unpin' : 'Pin'}
            </Button>
            <span className="text-[10px] text-muted">
              click {perfView.clickLatencyMs} ms · search {perfView.searchFocusLatencyMs} ms
            </span>
          </div>

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
