'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { projects, memories, type Project, type Memory, ApiError } from '@/lib/api';
import { ORG_ID_KEY } from '@/lib/constants';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RefreshCw, Brain, Sparkles, X as XIcon } from 'lucide-react';

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

/* ── Constants ─────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  project:  '#00D4FF',
  decision: '#00D4FF',
  finding:  '#7C3AFF',
  snippet:  '#00E5A0',
  code:     '#00E5A0',
  note:     '#FFB800',
  issue:    '#FF3B6E',
  todo:     '#FF3B6E',
  context:  '#94ADC8',
};

const COULOMB_K = 5000;
const SPRING_K = 0.005;
const SPRING_REST = 100;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.01;
const REFRESH_INTERVAL = 30000;
const BG_COLOR = '#060C18';

type BadgeVariant = 'brand' | 'violet' | 'ok' | 'warn' | 'err' | 'muted';

function typeVariant(type: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    project: 'brand', decision: 'brand', finding: 'violet',
    snippet: 'ok', code: 'ok', note: 'warn',
    issue: 'err', todo: 'err', context: 'muted',
  };
  return map[type] || 'muted';
}

/* ── Component ─────────────────────────────────────────────── */
export function BrainContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);
  const hoverRef = useRef<GraphNode | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ projects: 0, memories: 0 });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Keep ref in sync with state for the render loop
  useEffect(() => {
    selectedIdRef.current = selectedNode?.id ?? null;
  }, [selectedNode]);

  /* ── Data fetch ────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const projectList = await projects.list();
      if (projectList.length === 0) {
        setIsEmpty(true);
        if (nodesRef.current.length === 0) initPlaceholderNodes();
        setLoading(false);
        return;
      }

      const newNodes: GraphNode[] = [];
      const newEdges: GraphEdge[] = [];
      const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]));
      let memCount = 0;

      const cx = (containerRef.current?.clientWidth ?? 800) / 2;
      const cy = (containerRef.current?.clientHeight ?? 500) / 2;

      for (const proj of projectList) {
        const pId = `proj-${proj.id}`;
        const existing = existingMap.get(pId);
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 100;
        newNodes.push({
          id: pId,
          label: proj.name,
          type: 'project',
          x: existing?.x ?? cx + Math.cos(angle) * dist,
          y: existing?.y ?? cy + Math.sin(angle) * dist,
          vx: existing?.vx ?? 0,
          vy: existing?.vy ?? 0,
          radius: 22,
          pulsePhase: existing?.pulsePhase ?? Math.random() * Math.PI * 2,
          opacity: existing ? 1 : 0,
          data: proj,
        });

        try {
          const mems = await memories.list(proj.id);
          for (const mem of mems) {
            const mId = `mem-${mem.id}`;
            const mExisting = existingMap.get(mId);
            const mAngle = Math.random() * Math.PI * 2;
            const mDist = 80 + Math.random() * 150;
            memCount++;
            newNodes.push({
              id: mId,
              label: mem.title,
              type: (mem.type || 'note') as GraphNode['type'],
              x: mExisting?.x ?? cx + Math.cos(mAngle) * mDist,
              y: mExisting?.y ?? cy + Math.sin(mAngle) * mDist,
              vx: mExisting?.vx ?? 0,
              vy: mExisting?.vy ?? 0,
              radius: mem.type === 'snippet' || mem.type === 'code' ? 12 : 8 + Math.random() * 4,
              pulsePhase: mExisting?.pulsePhase ?? Math.random() * Math.PI * 2,
              opacity: mExisting ? 1 : 0,
              data: mem,
            });
            newEdges.push({
              source: pId,
              target: mId,
              dotProgress: Math.random(),
              dotSpeed: 0.003 + Math.random() * 0.004,
            });
          }
        } catch {
          // skip if memories fail for a project
        }
      }

      // Same-type inter-connections within each project
      const byProject = new Map<string, GraphNode[]>();
      for (const edge of newEdges) {
        const target = newNodes.find((n) => n.id === edge.target);
        if (target) {
          const list = byProject.get(edge.source) ?? [];
          list.push(target);
          byProject.set(edge.source, list);
        }
      }
      for (const [, group] of byProject) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if (group[i].type === group[j].type) {
              newEdges.push({
                source: group[i].id,
                target: group[j].id,
                dotProgress: Math.random(),
                dotSpeed: 0.001 + Math.random() * 0.002,
              });
            }
          }
        }
      }

      nodesRef.current = newNodes;
      edgesRef.current = newEdges;
      setStats({ projects: projectList.length, memories: memCount });
      setIsEmpty(false);
      setLastRefresh(new Date());
    } catch (err) {
      if (nodesRef.current.length === 0) {
        setIsEmpty(true);
        initPlaceholderNodes();
      }
      toast('error', err instanceof ApiError ? err.message : 'Failed to load brain data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function initPlaceholderNodes() {
    const cx = (containerRef.current?.clientWidth ?? 800) / 2;
    const cy = (containerRef.current?.clientHeight ?? 500) / 2;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const types: GraphNode['type'][] = ['decision', 'finding', 'snippet', 'note', 'issue', 'context'];

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 80 + Math.random() * 180;
      nodes.push({
        id: `placeholder-${i}`,
        label: '',
        type: types[i % types.length],
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 5 + Math.random() * 5,
        pulsePhase: Math.random() * Math.PI * 2,
        opacity: 0.35,
      });
    }

    for (let i = 0; i < 18; i++) {
      const a = Math.floor(Math.random() * nodes.length);
      let b = Math.floor(Math.random() * nodes.length);
      while (b === a) b = Math.floor(Math.random() * nodes.length);
      edges.push({
        source: nodes[a].id,
        target: nodes[b].id,
        dotProgress: Math.random(),
        dotSpeed: 0.001 + Math.random() * 0.002,
      });
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

    // Center gravity + damping + position update + fade-in
    for (const node of nodes) {
      if (dragRef.current && dragRef.current.node.id === node.id) continue;
      const dxC = cx - node.x;
      const dyC = cy - node.y;
      const distC = Math.sqrt(dxC * dxC + dyC * dyC);
      node.vx += (dxC / Math.max(distC, 1)) * CENTER_GRAVITY * distC;
      node.vy += (dyC / Math.max(distC, 1)) * CENTER_GRAVITY * distC;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(node.radius + 5, Math.min(w - node.radius - 5, node.x));
      node.y = Math.max(node.radius + 5, Math.min(h - node.radius - 5, node.y));

      // Fade-in
      if (node.opacity < 1) {
        node.opacity = Math.min(1, node.opacity + 1 / 30);
      }
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

    simulate();

    // 1. Clear with bg color
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const hovered = hoverRef.current;
    const selId = selectedIdRef.current;

    // 2. Draw edges + traveling dots
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const edgeOpacity = Math.min(a.opacity, b.opacity);
      const isHighlighted = hovered && (hovered.id === a.id || hovered.id === b.id);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted
        ? `rgba(0, 212, 255, ${0.35 * edgeOpacity})`
        : `rgba(0, 212, 255, ${0.12 * edgeOpacity})`;
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();

      // Traveling dot
      edge.dotProgress = (edge.dotProgress + edge.dotSpeed) % 1;
      const t = edge.dotProgress;
      const dotX = a.x + (b.x - a.x) * t;
      const dotY = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.arc(dotX, dotY, isHighlighted ? 2 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 212, 255, ${(isHighlighted ? 0.6 : 0.3) * edgeOpacity})`;
      ctx.fill();
    }

    // 3. Draw nodes
    ctx.save();
    for (const node of nodes) {
      const color = TYPE_COLORS[node.type] || '#94ADC8';
      const isHovered = hovered?.id === node.id;
      const isSelected = selId === node.id;
      const r = isHovered ? node.radius * 1.3 : node.radius;
      const pulse = Math.sin(time * 0.002 + node.pulsePhase);
      const glowAlpha = Math.max(0, Math.min(1, 0.2 + pulse * 0.1));

      ctx.globalAlpha = node.opacity;

      // Glow via shadow
      ctx.shadowBlur = 15 + pulse * 5;
      ctx.shadowColor = color;

      // Filled circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? color + 'DD' : color + '88';
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = color + (isHovered ? 'FF' : '55');
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      // Outer radial glow
      const grad = ctx.createRadialGradient(node.x, node.y, r * 0.8, node.x, node.y, r * 2.2);
      const hexAlpha = Math.round(glowAlpha * 255).toString(16).padStart(2, '0');
      grad.addColorStop(0, color + hexAlpha);
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Selected node animated ring
      if (isSelected) {
        const ringPulse = Math.sin(time * 0.005) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = node.opacity * ringPulse;
        ctx.stroke();
        ctx.globalAlpha = node.opacity;
      }

      // 4. Labels for project nodes or hovered
      if (node.type === 'project' || isHovered) {
        ctx.fillStyle = '#E2EEF9';
        ctx.font = `${node.type === 'project' ? 11 : 10}px "Space Grotesk", sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        const label = node.label.length > 24 ? node.label.slice(0, 22) + '…' : node.label;
        if (label) ctx.fillText(label, node.x, node.y + r + 16);
      }
    }
    ctx.restore();

    // 5. Tooltip
    if (hovered && hovered.label) {
      const padding = 10;
      const text = `${hovered.type}: ${hovered.label}`;
      ctx.font = '11px "Space Grotesk", sans-serif';
      const textWidth = ctx.measureText(text).width;
      const tx = Math.min(hovered.x + 18, w - textWidth - padding * 2 - 10);
      const ty = Math.max(hovered.y - 30, 25);

      ctx.fillStyle = 'rgba(13, 27, 48, 0.95)';
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty - 14, textWidth + padding * 2, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#E2EEF9';
      ctx.textAlign = 'left';
      ctx.fillText(text, tx + padding, ty + 5);
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
      if (dx * dx + dy * dy < (n.radius + 6) * (n.radius + 6)) return n;
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
    } else if (!node) {
      setSelectedNode(null);
    }
  }

  /* ── Effects ───────────────────────────────────────────── */
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Animation loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      /* canvas resizes on next render frame */
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  /* ── JSX ───────────────────────────────────────────────── */
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
          <span className="text-xs text-muted">
            {lastRefresh.toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadData()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-muted capitalize">{type}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-line"
        style={{ minHeight: '70vh', background: BG_COLOR }}
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
              <Brain className="h-20 w-20 text-brand/20 animate-pulse" />
              <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-violet/50" />
            </div>
            <h2 className="mb-2 font-display text-xl font-bold text-ink/80">
              Your brain is empty
            </h2>
            <p className="mb-4 max-w-sm text-sm text-ink-2">
              Create a project and add memories to see it grow.
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

      {/* Info panel */}
      {selectedNode && (
        <Card className="absolute right-4 top-20 z-20 w-72 animate-fade-in gradient-border shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <Badge
              variant={typeVariant(selectedNode.type)}
              className="capitalize"
            >
              {selectedNode.type}
            </Badge>
            <button
              onClick={() => setSelectedNode(null)}
              className="rounded p-1 text-muted hover:text-ink transition-colors"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <h3 className="mb-2 font-semibold text-ink">{selectedNode.label}</h3>

          {selectedNode.data && 'description' in selectedNode.data && selectedNode.data.description && (
            <p className="mb-2 text-xs text-ink-2">{selectedNode.data.description}</p>
          )}

          {selectedNode.data && 'body' in selectedNode.data && (
            <p className="mb-3 text-xs text-ink-2 line-clamp-4">
              {(selectedNode.data as Memory).body.slice(0, 200)}
            </p>
          )}

          {selectedNode.data && 'tags' in selectedNode.data && (selectedNode.data as Memory).tags && (
            <div className="mb-3 flex flex-wrap gap-1">
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

          {selectedNode.data && 'memory_count' in selectedNode.data && (
            <p className="mb-2 text-xs text-muted">
              {(selectedNode.data as Project).memory_count ?? 0} memories
            </p>
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
