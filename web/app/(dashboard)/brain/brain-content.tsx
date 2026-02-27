'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { projects, memories, type Project, type Memory, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshCw, Brain, Sparkles, X as XIcon, Pause, Play, Info } from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */
interface GraphNode {
  id: string;
  label: string;
  type: 'project' | 'decision' | 'finding' | 'snippet' | 'note' | 'issue' | 'context' | 'code' | 'todo';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
  opacity: number;
  data?: Project | Memory;
}

interface GraphEdge {
  source: string;
  target: string;
  dotProgress: number;
  dotSpeed: number;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface GraphTheme {
  bg: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
  edge: string;
  edgeHighlight: string;
  nodeColors: Record<string, string>;
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

/* ── Constants ─────────────────────────────────────────────── */
const DEFAULT_NODE_COLORS: Record<string, string> = {
  project: '#0ea5e9',
  decision: '#0ea5e9',
  finding: '#6366f1',
  snippet: '#22c55e',
  code: '#0f766e',
  note: '#eab308',
  issue: '#ef4444',
  todo: '#ef4444',
  context: '#94a3b8',
};

const TYPE_ORDER: GraphNode['type'][] = [
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

// Local simulation fallback constants (used only if worker unavailable).
const COULOMB_K = 5000;
const SPRING_K = 0.005;
const SPRING_REST = 100;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.008;

const REFRESH_INTERVAL = 30000;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function nodeScaleForZoom(zoom: number): number {
  return 0.9 + Math.min(zoom, 1.8) * 0.25;
}

/* ── Component ─────────────────────────────────────────────── */
export function BrainContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const hoverRef = useRef<GraphNode | null>(null);
  const hoverPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const cameraAnimRef = useRef<number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const workerRef = useRef<Worker | null>(null);
  const useLocalSimulationRef = useRef<boolean>(false);
  const searchQueryRef = useRef<string>('');
  const layoutStartRef = useRef<number>(0);
  const loadStartRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTsRef = useRef<number>(0);
  const fpsUpdateTsRef = useRef<number>(0);

  const themeRef = useRef<GraphTheme>({
    bg: '#020617',
    text: '#e5e7eb',
    tooltipBg: 'rgba(15, 23, 42, 0.95)',
    tooltipBorder: 'rgba(14, 116, 144, 0.45)',
    edge: 'rgba(148, 163, 184, 0.22)',
    edgeHighlight: 'rgba(14, 116, 144, 0.48)',
    nodeColors: DEFAULT_NODE_COLORS,
  });

  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ projects: 0, memories: 0 });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [paused, setPaused] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(Object.keys(DEFAULT_NODE_COLORS).filter((t) => t !== 'project'))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [telemetry, setTelemetry] = useState({
    fps: 0,
    loadMs: 0,
    layoutMs: 0,
    simulation: 'worker' as 'worker' | 'local',
  });

  const pausedRef = useRef(false);
  const activeTypesRef = useRef<Set<string>>(new Set(Object.keys(DEFAULT_NODE_COLORS).filter((t) => t !== 'project')));

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  function selectNode(node: GraphNode | null) {
    selectedIdRef.current = node?.id ?? null;
    setSelectedNode(node);
  }

  function computeSearchResults(query: string): GraphNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodesRef.current
      .filter((n) => isNodeVisible(n) && n.label && n.label.toLowerCase().includes(q))
      .sort((a, b) => {
        const ai = a.label.toLowerCase().indexOf(q);
        const bi = b.label.toLowerCase().indexOf(q);
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }

  function animateCameraTo(node: GraphNode, zoomTarget = 1.2) {
    const container = containerRef.current;
    if (!container) return;
    if (cameraAnimRef.current != null) {
      cancelAnimationFrame(cameraAnimRef.current);
    }

    const start = { ...cameraRef.current };
    const targetZoom = clamp(zoomTarget, MIN_ZOOM, MAX_ZOOM);
    const target = {
      zoom: targetZoom,
      x: -node.x * targetZoom,
      y: -node.y * targetZoom,
    };

    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
    const t0 = performance.now();

    if (duration === 0) {
      cameraRef.current = target;
      return;
    }

    const step = (now: number) => {
      const p = clamp((now - t0) / duration, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      cameraRef.current = {
        zoom: start.zoom + (target.zoom - start.zoom) * e,
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
      };
      if (p < 1) {
        cameraAnimRef.current = requestAnimationFrame(step);
      } else {
        cameraAnimRef.current = null;
      }
    };

    cameraAnimRef.current = requestAnimationFrame(step);
  }

  function focusNode(node: GraphNode) {
    selectNode(node);
    animateCameraTo(node, node.type === 'project' ? 1.0 : 1.25);
  }

  function postToWorker(message: BrainWorkerInMessage) {
    if (!workerRef.current) return;
    workerRef.current.postMessage(message);
  }

  function syncGraphToWorker() {
    if (!workerRef.current) return;
    layoutStartRef.current = performance.now();
    const nodes = nodesRef.current.map((n) => ({ id: n.id, x: n.x, y: n.y, radius: n.radius }));
    const edges = edgesRef.current.map((e) => ({ source: e.source, target: e.target }));
    postToWorker({ type: 'INIT_GRAPH', nodes, edges });
    if (pausedRef.current) {
      postToWorker({ type: 'PAUSE_LAYOUT' });
    }
  }

  useEffect(() => {
    pausedRef.current = paused;
    if (!workerRef.current) return;
    if (paused) postToWorker({ type: 'PAUSE_LAYOUT' });
    else postToWorker({ type: 'RESUME_LAYOUT' });
  }, [paused]);

  useEffect(() => {
    activeTypesRef.current = activeTypes;
    if (searchQuery.trim()) {
      setSearchResults(computeSearchResults(searchQuery));
    }
  }, [activeTypes, searchQuery]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPaused(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      const worker = new Worker(new URL('./brain-sim.worker.ts', import.meta.url));
      workerRef.current = worker;
      useLocalSimulationRef.current = false;
      setTelemetry((prev) => ({ ...prev, simulation: 'worker' }));
      if (nodesRef.current.length > 0) {
        syncGraphToWorker();
      }

      worker.onmessage = (event: MessageEvent<BrainWorkerOutMessage>) => {
        if (cancelled) return;
        const data = event.data;
        if (data.type === 'POSITIONS') {
          const posMap = new Map(data.nodes.map((n) => [n.id, n]));
          const nodes = nodesRef.current;
          for (const node of nodes) {
            const next = posMap.get(node.id);
            if (!next) continue;
            node.x = next.x;
            node.y = next.y;
          }
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
        useLocalSimulationRef.current = true;
        setTelemetry((prev) => ({ ...prev, simulation: 'local' }));
      };
    } catch {
      useLocalSimulationRef.current = true;
      setTelemetry((prev) => ({ ...prev, simulation: 'local' }));
    }

    return () => {
      cancelled = true;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  function readVar(style: CSSStyleDeclaration, key: string, fallback: string): string {
    const value = style.getPropertyValue(key).trim();
    return value || fallback;
  }

  function refreshThemeFromCss() {
    const root = document.documentElement;
    const style = getComputedStyle(root);

    const bg = readVar(style, '--cc-graph-bg', readVar(style, '--bg', '#020617'));
    const text = readVar(style, '--ink', '#e5e7eb');
    const edgeBase = readVar(style, '--cc-graph-edge-default', readVar(style, '--line', 'rgba(148,163,184,0.22)'));
    const edgeHighlight = readVar(style, '--cc-graph-edge-hover', readVar(style, '--brand', '#0ea5e9'));

    const tooltipBg = root.getAttribute('data-theme') === 'dark'
      ? 'rgba(2, 6, 23, 0.96)'
      : 'rgba(255, 255, 255, 0.96)';
    const tooltipBorder = readVar(style, '--brand', '#0ea5e9');

    const nodeColors: Record<string, string> = { ...DEFAULT_NODE_COLORS };
    for (const type of Object.keys(DEFAULT_NODE_COLORS)) {
      nodeColors[type] = readVar(style, `--cc-graph-node-${type}`, DEFAULT_NODE_COLORS[type]);
    }

    themeRef.current = {
      bg,
      text,
      tooltipBg,
      tooltipBorder,
      edge: edgeBase,
      edgeHighlight,
      nodeColors,
    };
  }

  useEffect(() => {
    refreshThemeFromCss();
    const observer = new MutationObserver(() => refreshThemeFromCss());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  function worldToScreen(wx: number, wy: number, w: number, h: number): { x: number; y: number } {
    const camera = cameraRef.current;
    return {
      x: wx * camera.zoom + w / 2 + camera.x,
      y: wy * camera.zoom + h / 2 + camera.y,
    };
  }

  function screenToWorld(sx: number, sy: number, w: number, h: number): { x: number; y: number } {
    const camera = cameraRef.current;
    return {
      x: (sx - w / 2 - camera.x) / camera.zoom,
      y: (sy - h / 2 - camera.y) / camera.zoom,
    };
  }

  function initialPosition(type: GraphNode['type'], key: string, anchor?: { x: number; y: number }) {
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

  function isNodeVisible(node: GraphNode): boolean {
    if (node.type === 'project') return true;
    return activeTypesRef.current.has(node.type);
  }

  /* ── Data fetch ────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    loadStartRef.current = performance.now();
    setLoading(true);
    try {
      const projectList = await projects.list();
      if (projectList.length === 0) {
        setIsEmpty(true);
        if (nodesRef.current.length === 0) {
          initPlaceholderNodes();
          syncGraphToWorker();
        }
        setLoading(false);
        return;
      }

      const newNodes: GraphNode[] = [];
      const newEdges: GraphEdge[] = [];
      const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]));
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
        const seedPos = initialPosition('project', pId);

        const projectNode: GraphNode = {
          id: pId,
          label: proj.name,
          type: 'project',
          x: existing?.x ?? seedPos.x,
          y: existing?.y ?? seedPos.y,
          vx: existing?.vx ?? 0,
          vy: existing?.vy ?? 0,
          radius: 22,
          pulsePhase: existing?.pulsePhase ?? hashString(`${pId}:pulse`) * Math.PI * 2,
          opacity: existing ? 1 : 0,
          data: proj,
        };
        newNodes.push(projectNode);

        for (const mem of mems) {
          const mId = `mem-${mem.id}`;
          const mExisting = existingMap.get(mId);
          const memoryType = (mem.type || 'note') as GraphNode['type'];
          const seedPosMem = initialPosition(memoryType, mId, { x: projectNode.x, y: projectNode.y });
          memCount++;

          newNodes.push({
            id: mId,
            label: mem.title ?? `Memory #${mem.id}`,
            type: memoryType,
            x: mExisting?.x ?? seedPosMem.x,
            y: mExisting?.y ?? seedPosMem.y,
            vx: mExisting?.vx ?? 0,
            vy: mExisting?.vy ?? 0,
            radius: mem.type === 'snippet' || mem.type === 'code' ? 12 : 8 + hashString(`${mId}:r`) * 4,
            pulsePhase: mExisting?.pulsePhase ?? hashString(`${mId}:pulse`) * Math.PI * 2,
            opacity: mExisting ? 1 : 0,
            data: mem,
          });

          newEdges.push({
            source: pId,
            target: mId,
            dotProgress: hashString(`${mId}:dot`),
            dotSpeed: 0.003 + hashString(`${mId}:speed`) * 0.004,
          });
        }
      }

      const byProject = new Map<string, GraphNode[]>();
      for (const edge of newEdges) {
        const target = newNodes.find((n) => n.id === edge.target);
        if (!target) continue;
        const list = byProject.get(edge.source) ?? [];
        list.push(target);
        byProject.set(edge.source, list);
      }
      for (const [, group] of byProject) {
        const byType = new Map<GraphNode['type'], GraphNode[]>();
        for (const node of group) {
          const list = byType.get(node.type) ?? [];
          list.push(node);
          byType.set(node.type, list);
        }
        for (const [, typed] of byType) {
          typed.sort((a, b) => a.id.localeCompare(b.id));
          for (let i = 0; i < typed.length; i++) {
            for (let j = i + 1; j < Math.min(typed.length, i + 1 + SAME_TYPE_EDGE_NEIGHBORS); j++) {
              newEdges.push({
                source: typed[i].id,
                target: typed[j].id,
                dotProgress: hashString(`${typed[i].id}:${typed[j].id}:d`),
                dotSpeed: 0.001 + hashString(`${typed[i].id}:${typed[j].id}:s`) * 0.002,
              });
            }
          }
        }
      }

      nodesRef.current = newNodes;
      edgesRef.current = newEdges;
      syncGraphToWorker();
      if (searchQueryRef.current.trim()) {
        setSearchResults(computeSearchResults(searchQueryRef.current));
      }

      setStats({ projects: projectList.length, memories: memCount });
      setIsEmpty(false);
      setLastRefresh(new Date());

      if (selectedIdRef.current) {
        const nextSelected = newNodes.find((n) => n.id === selectedIdRef.current) || null;
        setSelectedNode(nextSelected);
      }
    } catch (err) {
      if (nodesRef.current.length === 0) {
        setIsEmpty(true);
        initPlaceholderNodes();
        syncGraphToWorker();
      }
      toast('error', err instanceof ApiError ? err.message : 'Failed to load brain data');
    } finally {
      if (loadStartRef.current > 0) {
        setTelemetry((prev) => ({
          ...prev,
          loadMs: Math.round(performance.now() - loadStartRef.current),
        }));
      }
      setLoading(false);
    }
  }, [toast]);

  function initPlaceholderNodes() {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const types: GraphNode['type'][] = ['decision', 'finding', 'snippet', 'note', 'issue', 'context'];

    for (let i = 0; i < 20; i++) {
      const nodeType = types[i % types.length];
      const pos = initialPosition(nodeType, `placeholder-${i}`);
      nodes.push({
        id: `placeholder-${i}`,
        label: '',
        type: nodeType,
        x: pos.x,
        y: pos.y,
        vx: (hashString(`pvx-${i}`) - 0.5) * 0.3,
        vy: (hashString(`pvy-${i}`) - 0.5) * 0.3,
        radius: 5 + hashString(`pr-${i}`) * 5,
        pulsePhase: hashString(`pp-${i}`) * Math.PI * 2,
        opacity: 0.35,
      });
    }

    for (let i = 0; i < 18; i++) {
      const a = Math.floor(hashString(`ea-${i}`) * nodes.length);
      let b = Math.floor(hashString(`eb-${i}`) * nodes.length);
      if (b === a) b = (b + 1) % nodes.length;
      edges.push({
        source: nodes[a].id,
        target: nodes[b].id,
        dotProgress: hashString(`edp-${i}`),
        dotSpeed: 0.001 + hashString(`eds-${i}`) * 0.002,
      });
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }

  /* ── Local simulation fallback ─────────────────────────── */
  function simulateLocal() {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const force = COULOMB_K / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!dragRef.current || dragRef.current.node.id !== a.id) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!dragRef.current || dragRef.current.node.id !== b.id) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const displacement = dist - SPRING_REST;
      const force = SPRING_K * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!dragRef.current || dragRef.current.node.id !== a.id) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!dragRef.current || dragRef.current.node.id !== b.id) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const node of nodes) {
      if (dragRef.current && dragRef.current.node.id === node.id) continue;
      node.vx += -node.x * CENTER_GRAVITY;
      node.vy += -node.y * CENTER_GRAVITY;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.vx = clamp(node.vx, -8, 8);
      node.vy = clamp(node.vy, -8, 8);
      node.x += node.vx;
      node.y += node.vy;
      node.x = clamp(node.x, -2400, 2400);
      node.y = clamp(node.y, -2400, 2400);

      if (node.opacity < 1) node.opacity = Math.min(1, node.opacity + 1 / 30);
    }
  }

  /* ── Render loop ───────────────────────────────────────── */
  function render() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    timeRef.current = performance.now();
    const time = timeRef.current;

    if (lastFrameTsRef.current > 0) {
      const dt = time - lastFrameTsRef.current;
      if (dt > 0 && dt < 1000) {
        frameTimesRef.current.push(dt);
        if (frameTimesRef.current.length > 120) {
          frameTimesRef.current.shift();
        }
      }
      if (time - fpsUpdateTsRef.current > 500 && frameTimesRef.current.length > 8) {
        const avg = frameTimesRef.current.reduce((sum, v) => sum + v, 0) / frameTimesRef.current.length;
        const fps = Math.round(1000 / avg);
        fpsUpdateTsRef.current = time;
        setTelemetry((prev) => (prev.fps === fps ? prev : { ...prev, fps }));
      }
    } else {
      fpsUpdateTsRef.current = time;
    }
    lastFrameTsRef.current = time;

    if (!pausedRef.current && useLocalSimulationRef.current) {
      simulateLocal();
    }

    const theme = themeRef.current;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const hovered = hoverRef.current;
    const selId = selectedIdRef.current;
    const zoom = cameraRef.current.zoom;

    const drawEdges = zoom > 0.4 || nodes.length <= 500;
    const drawTravelDots = zoom > 0.8 && edges.length <= 3000;
    const showProjectLabels = zoom > 0.5;
    const showDenseLabels = zoom > 1.15 && nodes.length <= 1000;

    if (drawEdges) {
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b || !isNodeVisible(a) || !isNodeVisible(b)) continue;

        const sa = worldToScreen(a.x, a.y, w, h);
        const sb = worldToScreen(b.x, b.y, w, h);

        const edgeOpacity = Math.min(a.opacity, b.opacity);
        const isHighlighted = hovered && (hovered.id === a.id || hovered.id === b.id);

        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.strokeStyle = isHighlighted ? theme.edgeHighlight : theme.edge;
        ctx.globalAlpha = (isHighlighted ? 0.7 : 0.35) * edgeOpacity;
        ctx.lineWidth = isHighlighted ? 1.3 : 0.8;
        ctx.stroke();

        if (drawTravelDots) {
          edge.dotProgress = (edge.dotProgress + edge.dotSpeed) % 1;
          const t = edge.dotProgress;
          const dotX = sa.x + (sb.x - sa.x) * t;
          const dotY = sa.y + (sb.y - sa.y) * t;
          ctx.beginPath();
          ctx.arc(dotX, dotY, isHighlighted ? 1.8 : 1.2, 0, Math.PI * 2);
          ctx.globalAlpha = (isHighlighted ? 0.6 : 0.25) * edgeOpacity;
          ctx.fillStyle = theme.edgeHighlight;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    for (const node of nodes) {
      if (!isNodeVisible(node)) continue;

      const screen = worldToScreen(node.x, node.y, w, h);
      const color = theme.nodeColors[node.type] || DEFAULT_NODE_COLORS[node.type] || '#94a3b8';
      const isHovered = hovered?.id === node.id;
      const isSelected = selId === node.id;
      const scaledRadius = node.radius * nodeScaleForZoom(zoom);
      const r = isHovered ? scaledRadius * 1.22 : scaledRadius;
      const pulse = Math.sin(time * 0.002 + node.pulsePhase);
      const glowAlpha = Math.max(0.08, Math.min(0.38, 0.2 + pulse * 0.1));

      ctx.globalAlpha = node.opacity;

      ctx.shadowBlur = 12 + pulse * 4;
      ctx.shadowColor = color;

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = node.opacity * (isHovered ? 0.95 : 0.7);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.globalAlpha = node.opacity * (isHovered ? 0.95 : 0.6);
      ctx.stroke();

      const grad = ctx.createRadialGradient(screen.x, screen.y, r * 0.7, screen.x, screen.y, r * 2.2);
      grad.addColorStop(0, `${color}${Math.round(glowAlpha * 255).toString(16).padStart(2, '0')}`);
      grad.addColorStop(1, `${color}00`);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.globalAlpha = node.opacity * 0.6;
      ctx.fill();

      if (isSelected) {
        const ringPulse = Math.sin(time * 0.005) * 0.3 + 0.75;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = node.opacity * ringPulse;
        ctx.stroke();
      }

      const shouldShowLabel = isHovered || (node.type === 'project' && showProjectLabels) || (showDenseLabels && node.radius >= 10);

      if (shouldShowLabel && node.label) {
        const label = node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label;
        ctx.globalAlpha = node.opacity;
        ctx.fillStyle = theme.text;
        ctx.font = `${node.type === 'project' ? 11 : 10}px ${'"Inter", sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.fillText(label, screen.x, screen.y + r + 14);
      }
    }

    ctx.globalAlpha = 1;

    if (hovered && hovered.label && isNodeVisible(hovered)) {
      const hs = worldToScreen(hovered.x, hovered.y, w, h);
      const padding = 10;
      const text = `${hovered.type}: ${hovered.label}`;
      ctx.font = '11px "Inter", sans-serif';
      const textWidth = ctx.measureText(text).width;
      const tx = Math.min(hs.x + 18, w - textWidth - padding * 2 - 10);
      const ty = Math.max(hs.y - 30, 25);

      ctx.fillStyle = theme.tooltipBg;
      ctx.strokeStyle = theme.tooltipBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty - 14, textWidth + padding * 2, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.fillText(text, tx + padding, ty + 5);
    }

    rafRef.current = requestAnimationFrame(render);
  }

  /* ── Pointer handlers ──────────────────────────────────── */
  function findNodeAtClient(clientX: number, clientY: number): GraphNode | null {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const world = screenToWorld(mx, my, container.clientWidth, container.clientHeight);
    const zoom = cameraRef.current.zoom;

    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (!isNodeVisible(n)) continue;
      const hitRadius = n.radius * nodeScaleForZoom(zoom) + 8 / zoom;
      const dx = world.x - n.x;
      const dy = world.y - n.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return n;
    }
    return null;
  }

  function updateHoverFromPointer() {
    const pointer = hoverPointerRef.current;
    if (!pointer) return;
    const node = findNodeAtClient(pointer.clientX, pointer.clientY);
    hoverRef.current = node;

    const canvas = canvasRef.current;
    if (!canvas) return;
    if (dragRef.current || panRef.current) canvas.style.cursor = 'grabbing';
    else canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function scheduleHoverUpdate() {
    if (hoverRafRef.current != null) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null;
      updateHoverFromPointer();
    });
  }

  function handleMouseMove(e: React.MouseEvent) {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    hoverPointerRef.current = { clientX: e.clientX, clientY: e.clientY };

    if (dragRef.current) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy, container.clientWidth, container.clientHeight);
      const nextX = world.x - dragRef.current.offsetX;
      const nextY = world.y - dragRef.current.offsetY;
      dragRef.current.node.x = nextX;
      dragRef.current.node.y = nextY;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
      dragRef.current.moved = true;

      if (workerRef.current) {
        postToWorker({ type: 'PIN_NODE', id: dragRef.current.node.id, x: nextX, y: nextY });
      }

      canvas.style.cursor = 'grabbing';
      return;
    }

    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      cameraRef.current.x = panRef.current.baseX + dx;
      cameraRef.current.y = panRef.current.baseY + dy;
      if (!panRef.current.moved && Math.abs(dx) + Math.abs(dy) > 2) {
        panRef.current.moved = true;
      }
      canvas.style.cursor = 'grabbing';
      return;
    }

    scheduleHoverUpdate();
  }

  function handleMouseDown(e: React.MouseEvent) {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const node = findNodeAtClient(e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, container.clientWidth, container.clientHeight);

    if (node) {
      dragRef.current = {
        node,
        offsetX: world.x - node.x,
        offsetY: world.y - node.y,
        moved: false,
      };
      if (workerRef.current) {
        postToWorker({ type: 'PIN_NODE', id: node.id, x: node.x, y: node.y });
      }
      canvas.style.cursor = 'grabbing';
      return;
    }

    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: cameraRef.current.x,
      baseY: cameraRef.current.y,
      moved: false,
    };
    canvas.style.cursor = 'grabbing';
  }

  function handleMouseUp(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current) {
      const { moved, node } = dragRef.current;
      dragRef.current = null;

      if (workerRef.current) {
        postToWorker({ type: 'UNPIN_NODE', id: node.id });
        if (!pausedRef.current) postToWorker({ type: 'KICK', alpha: 0.12 });
      }

      if (!moved) {
        const hit = findNodeAtClient(e.clientX, e.clientY);
        if (hit && hit.data) selectNode(hit);
      }
      canvas.style.cursor = 'grab';
      return;
    }

    if (panRef.current) {
      const { moved } = panRef.current;
      panRef.current = null;
      if (!moved) {
        const node = findNodeAtClient(e.clientX, e.clientY);
        if (node && node.data) selectNode(node);
        else selectNode(null);
      }
      canvas.style.cursor = 'grab';
      return;
    }

    const node = findNodeAtClient(e.clientX, e.clientY);
    if (node && node.data) selectNode(node);
    else selectNode(null);
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy, container.clientWidth, container.clientHeight);
    const zoomFactor = e.deltaY < 0 ? 1.09 : 0.92;
    const nextZoom = clamp(cameraRef.current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
    cameraRef.current.zoom = nextZoom;
    cameraRef.current.x = sx - container.clientWidth / 2 - before.x * nextZoom;
    cameraRef.current.y = sy - container.clientHeight / 2 - before.y * nextZoom;
  }

  function applyKeyboardZoom(multiplier: number) {
    const container = containerRef.current;
    if (!container) return;
    const sx = container.clientWidth / 2;
    const sy = container.clientHeight / 2;
    const before = screenToWorld(sx, sy, container.clientWidth, container.clientHeight);
    const nextZoom = clamp(cameraRef.current.zoom * multiplier, MIN_ZOOM, MAX_ZOOM);
    cameraRef.current.zoom = nextZoom;
    cameraRef.current.x = sx - container.clientWidth / 2 - before.x * nextZoom;
    cameraRef.current.y = sy - container.clientHeight / 2 - before.y * nextZoom;
  }

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setSearchResults(computeSearchResults(value));
  }

  /* ── Effects ───────────────────────────────────────────── */
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current);
      if (cameraAnimRef.current != null) cancelAnimationFrame(cameraAnimRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // Canvas resize handled in render loop.
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping) return;

      const panStep = 28;
      if (event.key === 'ArrowLeft') {
        cameraRef.current.x += panStep;
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight') {
        cameraRef.current.x -= panStep;
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowUp') {
        cameraRef.current.y += panStep;
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowDown') {
        cameraRef.current.y -= panStep;
        event.preventDefault();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        applyKeyboardZoom(1.1);
        event.preventDefault();
        return;
      }
      if (event.key === '-') {
        applyKeyboardZoom(0.9);
        event.preventDefault();
        return;
      }
      if (event.key === '0') {
        cameraRef.current = { x: 0, y: 0, zoom: 1 };
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        setSearchResults([]);
        selectNode(null);
        event.preventDefault();
        return;
      }
      if (event.key === 'Tab') {
        const visible = nodesRef.current.filter((n) => isNodeVisible(n) && n.label);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.label.localeCompare(b.label));
        const currentIndex = selectedIdRef.current
          ? visible.findIndex((n) => n.id === selectedIdRef.current)
          : -1;
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + visible.length) % visible.length;
        const next = visible[nextIndex];
        if (next) {
          focusNode(next);
          event.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── JSX ───────────────────────────────────────────────── */
  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brain</h1>
          <p className="mt-1 text-sm text-ink-2">Neural graph of your project knowledge.</p>
          {!isEmpty && (
            <p className="mt-1 text-xs text-muted">
              {telemetry.simulation} sim · {telemetry.fps} fps · load {telemetry.loadMs} ms · layout {telemetry.layoutMs} ms
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isEmpty && (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="text-xs text-ink-2">
                {stats.projects} project{stats.projects !== 1 ? 's' : ''} · {stats.memories} memor{stats.memories !== 1 ? 'ies' : 'y'}
              </span>
              {loading && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                </span>
              )}
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
              onChange={(e) => handleSearchInput(e.target.value)}
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
            {Object.entries(themeRef.current.nodeColors).map(([type, color]) => (
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
                    onClick={() =>
                      setActiveTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      })
                    }
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
              Drag nodes, drag background to pan, wheel to zoom, click for details
            </span>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-line"
        style={{ minHeight: '70vh', background: themeRef.current.bg }}
      >
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

        <canvas
          ref={canvasRef}
          className="h-full w-full"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (dragRef.current && workerRef.current) {
              postToWorker({ type: 'UNPIN_NODE', id: dragRef.current.node.id });
            }
            dragRef.current = null;
            panRef.current = null;
            hoverRef.current = null;
            hoverPointerRef.current = null;
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = 'default';
          }}
          onWheel={handleWheel}
        />
      </div>

      {selectedNode && (
        <Card className="absolute right-4 top-20 z-20 w-72 animate-fade-in shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <Badge variant={typeVariant(selectedNode.type)} className="capitalize">
              {selectedNode.type}
            </Badge>
            <button
              onClick={() => selectNode(null)}
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
