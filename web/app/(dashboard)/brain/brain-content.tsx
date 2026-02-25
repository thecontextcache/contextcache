'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Brain, Sparkles, RefreshCw, Info, X, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { projects, memories, type Project, type Memory } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */
interface GraphNode {
  id: string;
  label: string;
  type: 'project' | 'decision' | 'finding' | 'snippet' | 'note' | 'issue' | 'context';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  data?: Project | Memory;
}

interface GraphEdge {
  source: string;
  target: string;
}

/* ── Constants ─────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  project: '#00D4FF',
  decision: '#00D4FF',
  finding: '#7C3AFF',
  snippet: '#00E5A0',
  note: '#FFB800',
  issue: '#FF3B6E',
  context: '#94ADC8',
};

const COULOMB_K = 2000;
const SPRING_K = 0.005;
const SPRING_REST = 120;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.0005;
const REFRESH_INTERVAL = 30000;

/* ── Component ─────────────────────────────────────────────── */
export function BrainContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);
  const hoverRef = useRef<GraphNode | null>(null);

  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ projects: 0, memories: 0, types: 0 });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  /* ── Data fetch ────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const projectList = await projects.list();
      if (projectList.length === 0) {
        setIsEmpty(true);
        initPlaceholderNodes();
        setLoading(false);
        return;
      }

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const typesSet = new Set<string>();
      let memCount = 0;

      const cx = (containerRef.current?.clientWidth ?? 800) / 2;
      const cy = (containerRef.current?.clientHeight ?? 500) / 2;

      for (const proj of projectList) {
        const pId = `proj-${proj.id}`;
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 100;
        nodes.push({
          id: pId,
          label: proj.name,
          type: 'project',
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius: 18,
          data: proj,
        });

        try {
          const mems = await memories.list(proj.id);
          for (const mem of mems) {
            const mId = `mem-${mem.id}`;
            const mAngle = Math.random() * Math.PI * 2;
            const mDist = 80 + Math.random() * 150;
            typesSet.add(mem.type);
            memCount++;
            nodes.push({
              id: mId,
              label: mem.title,
              type: mem.type as GraphNode['type'],
              x: cx + Math.cos(mAngle) * mDist,
              y: cy + Math.sin(mAngle) * mDist,
              vx: 0,
              vy: 0,
              radius: 10,
              data: mem,
            });
            edges.push({ source: pId, target: mId });
          }
        } catch {
          // skip project if memories fail
        }
      }

      // Tag-based edges between memories sharing tags
      const memNodes = nodes.filter((n) => n.id.startsWith('mem-'));
      for (let i = 0; i < memNodes.length; i++) {
        for (let j = i + 1; j < memNodes.length; j++) {
          const a = memNodes[i].data as Memory | undefined;
          const b = memNodes[j].data as Memory | undefined;
          if (a?.tags && b?.tags) {
            const shared = a.tags.filter((t) => b.tags!.includes(t));
            if (shared.length > 0) {
              edges.push({ source: memNodes[i].id, target: memNodes[j].id });
            }
          }
        }
      }

      nodesRef.current = nodes;
      edgesRef.current = edges;
      setStats({ projects: projectList.length, memories: memCount, types: typesSet.size });
      setIsEmpty(false);
      setLastRefresh(new Date());
    } catch {
      setIsEmpty(true);
      initPlaceholderNodes();
    } finally {
      setLoading(false);
    }
  }, []);

  function initPlaceholderNodes() {
    const cx = (containerRef.current?.clientWidth ?? 800) / 2;
    const cy = (containerRef.current?.clientHeight ?? 500) / 2;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const types: GraphNode['type'][] = ['decision', 'finding', 'snippet', 'note', 'issue', 'context'];

    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 200;
      nodes.push({
        id: `placeholder-${i}`,
        label: '',
        type: types[i % types.length],
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 6 + Math.random() * 6,
      });
    }

    for (let i = 0; i < 15; i++) {
      const a = Math.floor(Math.random() * nodes.length);
      let b = Math.floor(Math.random() * nodes.length);
      while (b === a) b = Math.floor(Math.random() * nodes.length);
      edges.push({ source: nodes[a].id, target: nodes[b].id });
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }

  /* ── Physics simulation ────────────────────────────────── */
  function simulate() {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const w = containerRef.current?.clientWidth ?? 800;
    const h = containerRef.current?.clientHeight ?? 500;
    const cx = w / 2;
    const cy = h / 2;

    // Coulomb repulsion
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

    // Hooke springs
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

    // Center gravity + damping + position update
    for (const node of nodes) {
      if (dragRef.current && dragRef.current.node.id === node.id) continue;
      node.vx += (cx - node.x) * CENTER_GRAVITY;
      node.vy += (cy - node.y) * CENTER_GRAVITY;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      // Keep in bounds with padding
      node.x = Math.max(node.radius, Math.min(w - node.radius, node.x));
      node.y = Math.max(node.radius, Math.min(h - node.radius, node.y));
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
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    simulate();

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const hovered = hoverRef.current;

    // Draw edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const isHighlighted = hovered && (hovered.id === a.id || hovered.id === b.id);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted
        ? 'rgba(0, 212, 255, 0.4)'
        : 'rgba(0, 212, 255, 0.08)';
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const color = TYPE_COLORS[node.type] || '#94ADC8';
      const isHovered = hovered?.id === node.id;
      const r = isHovered ? node.radius * 1.3 : node.radius;

      // Glow
      const gradient = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, r * 2.5);
      gradient.addColorStop(0, color + (isHovered ? '40' : '15'));
      gradient.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color + (isHovered ? 'CC' : '80');
      ctx.fill();
      ctx.strokeStyle = color + (isHovered ? 'FF' : '40');
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      // Label for project nodes or hovered
      if (node.type === 'project' || isHovered) {
        ctx.fillStyle = '#E2EEF9';
        ctx.font = `${isHovered ? '12' : '10'}px "Space Grotesk", sans-serif`;
        ctx.textAlign = 'center';
        const label = node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label;
        ctx.fillText(label, node.x, node.y + r + 14);
      }
    }

    // Tooltip for hovered node
    if (hovered && hovered.label) {
      const padding = 8;
      const text = `${hovered.type}: ${hovered.label}`;
      ctx.font = '11px "Space Grotesk", sans-serif';
      const textWidth = ctx.measureText(text).width;
      const tx = Math.min(hovered.x + 15, w - textWidth - padding * 2 - 10);
      const ty = Math.max(hovered.y - 25, 20);

      ctx.fillStyle = 'rgba(13, 27, 48, 0.92)';
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty - 12, textWidth + padding * 2, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#E2EEF9';
      ctx.textAlign = 'left';
      ctx.fillText(text, tx + padding, ty + 4);
    }

    rafRef.current = requestAnimationFrame(render);
  }

  /* ── Mouse handlers ────────────────────────────────────── */
  function findNodeAt(clientX: number, clientY: number): GraphNode | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy < (n.radius + 5) * (n.radius + 5)) return n;
    }
    return null;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      dragRef.current.node.x = e.clientX - rect.left - dragRef.current.offsetX;
      dragRef.current.node.y = e.clientY - rect.top - dragRef.current.offsetY;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
    }
    hoverRef.current = findNodeAt(e.clientX, e.clientY);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = hoverRef.current ? 'pointer' : 'default';
  }

  function handleMouseDown(e: React.MouseEvent) {
    const node = findNodeAt(e.clientX, e.clientY);
    if (node) {
      const rect = canvasRef.current!.getBoundingClientRect();
      dragRef.current = {
        node,
        offsetX: e.clientX - rect.left - node.x,
        offsetY: e.clientY - rect.top - node.y,
      };
    }
  }

  function handleMouseUp() {
    dragRef.current = null;
  }

  function handleClick(e: React.MouseEvent) {
    const node = findNodeAt(e.clientX, e.clientY);
    if (node && node.data) {
      setSelectedNode(node);
    }
  }

  /* ── Effects ───────────────────────────────────────────── */
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Brain</h1>
          <p className="mt-1 text-sm text-ink-2">
            Neural graph of your project knowledge.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { loadData(); }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {!isEmpty && (
        <div className="mb-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5">
            <Layers className="h-3.5 w-3.5 text-brand" />
            <span className="text-xs text-ink-2">{stats.projects} project{stats.projects !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5">
            <Brain className="h-3.5 w-3.5 text-violet" />
            <span className="text-xs text-ink-2">{stats.memories} memor{stats.memories !== 1 ? 'ies' : 'y'}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-ok" />
            <span className="text-xs text-ink-2">{stats.types} type{stats.types !== 1 ? 's' : ''}</span>
          </div>
          {/* Legend */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-muted capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative min-h-[60vh] overflow-hidden rounded-xl border border-line bg-panel"
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel/80">
            <div className="flex flex-col items-center gap-3">
              <Brain className="h-10 w-10 animate-pulse text-brand/50" />
              <p className="text-sm text-muted">Loading neural graph…</p>
            </div>
          </div>
        )}

        {isEmpty && !loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <Brain className="h-20 w-20 text-brand/20 animate-pulse" />
              <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-violet/50" />
            </div>
            <h2 className="mb-2 font-display text-xl font-bold text-ink/80">Dormant brain</h2>
            <p className="mb-4 max-w-sm text-sm text-ink-2">
              Create a project and add memories to see your knowledge graph come alive.
            </p>
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
          onMouseLeave={() => { dragRef.current = null; hoverRef.current = null; }}
          onClick={handleClick}
        />
      </div>

      {/* Info panel for selected node */}
      {selectedNode && (
        <div className="absolute right-4 top-20 z-20 w-72 animate-fade-in rounded-xl border border-line bg-panel p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <Badge
              variant={selectedNode.type === 'project' ? 'brand' : 'muted'}
              className="capitalize"
            >
              {selectedNode.type}
            </Badge>
            <button
              onClick={() => setSelectedNode(null)}
              className="rounded p-1 text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="mb-2 font-semibold text-ink">{selectedNode.label}</h3>
          {selectedNode.data && 'body' in selectedNode.data && (
            <p className="mb-3 text-xs text-ink-2 line-clamp-4">
              {(selectedNode.data as Memory).body}
            </p>
          )}
          {selectedNode.data && 'tags' in selectedNode.data && (selectedNode.data as Memory).tags && (
            <div className="flex flex-wrap gap-1">
              {((selectedNode.data as Memory).tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {selectedNode.data && 'created_at' in selectedNode.data && (
            <div className="mt-3 flex items-center gap-1 text-[10px] text-muted">
              <Info className="h-3 w-3" />
              {new Date(selectedNode.data.created_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
