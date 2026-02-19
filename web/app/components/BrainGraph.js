"use client";

/**
 * BrainGraph — interactive neural-graph canvas visualization.
 *
 * Renders a force-directed graph of projects (hub nodes) and memories (leaf nodes).
 * Physics run inside a requestAnimationFrame loop using refs — no React state updates
 * during animation, so performance is smooth even with 150+ nodes.
 *
 * Props:
 *   projects    — Array of { id, name }
 *   memoriesByProject — Map of projectId -> Array of { id, type, title, content, created_at }
 *   highlightIds — Set of memory IDs to highlight (e.g. from recall results)
 *   onNodeClick  — (node) => void, called with full node data on click
 */

import { useEffect, useRef } from "react";

// ── Design constants ─────────────────────────────────────────────────────────

const TYPE_COLORS = {
  decision:   "#00D4FF",
  finding:    "#A78BFA",
  definition: "#00E5A0",
  note:       "#FFB800",
  link:       "#FF6B6B",
  todo:       "#F472B6",
  chat:       "#38BDF8",
  doc:        "#6EE7B7",
  code:       "#FCD34D",
};
const PROJECT_COLOR    = "#00D4FF";
const BG_COLOR         = "#060C18";
const EDGE_ALPHA       = 0.13;
const EDGE_HIGHLIGHT   = 0.6;
const LABEL_COLOR      = "rgba(226,238,249,0.75)";
const TOOLTIP_BG       = "rgba(13,27,46,0.95)";
const MAX_NODES        = 160; // cap total nodes for perf

// ── Physics constants ────────────────────────────────────────────────────────
const REPULSION        = 2200;
const SPRING_REST      = 90;
const SPRING_K         = 0.025;
const CENTER_GRAVITY   = 0.002;
const DAMPING          = 0.85;
const DT               = 1;

// ────────────────────────────────────────────────────────────────────────────

function buildGraph(projects, memoriesByProject) {
  const nodes = [];
  const edges = [];

  projects.forEach((p) => {
    const mems = (memoriesByProject[p.id] || []).slice(0, Math.floor(MAX_NODES / Math.max(1, projects.length)));
    const cx = Math.random() * 600 + 100;
    const cy = Math.random() * 400 + 100;

    nodes.push({
      id:       `proj-${p.id}`,
      kind:     "project",
      label:    p.name,
      rawId:    p.id,
      x: cx, y: cy,
      vx: 0,  vy: 0,
      radius:  15,
      color:   PROJECT_COLOR,
      pulse:   0, // 0..1 — active pulse
      created: p.created_at,
    });

    mems.forEach((m) => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 60 + Math.random() * 80;
      nodes.push({
        id:      `mem-${m.id}`,
        kind:    "memory",
        label:   m.title || m.content?.slice(0, 40) || m.type,
        rawId:   m.id,
        projId:  `proj-${p.id}`,
        type:    m.type,
        x:       cx + Math.cos(angle) * dist,
        y:       cy + Math.sin(angle) * dist,
        vx: 0,   vy: 0,
        radius:  7,
        color:   TYPE_COLORS[m.type] || "#4A6685",
        pulse:   0,
        created: m.created_at,
      });
      edges.push({ from: `proj-${p.id}`, to: `mem-${m.id}` });
    });
  });

  return { nodes, edges };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrainGraph({
  projects       = [],
  memoriesByProject = {},
  highlightIds   = [],
  onNodeClick,
}) {
  const canvasRef     = useRef(null);
  const animRef       = useRef(null);
  const stateRef      = useRef({ nodes: [], edges: [], w: 800, h: 500 });
  const hoverRef      = useRef(null);    // hovered node id
  const highlightRef  = useRef(new Set(highlightIds));
  const reducedMotion = useRef(false);

  // Sync highlight set into ref without restarting animation
  useEffect(() => {
    highlightRef.current = new Set(highlightIds);
    // Pulse highlighted nodes
    stateRef.current.nodes.forEach((n) => {
      if (n.kind === "memory" && highlightRef.current.has(String(n.rawId))) {
        n.pulse = 1.0;
      }
    });
  }, [highlightIds]);

  // Rebuild graph when data changes
  useEffect(() => {
    if (!projects.length) return;
    const { nodes, edges } = buildGraph(projects, memoriesByProject);
    // Re-center on canvas
    const { w, h } = stateRef.current;
    nodes.forEach((n) => {
      n.x = Math.max(n.radius + 10, Math.min((w || 800) - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min((h || 500) - n.radius - 10, n.y));
    });
    stateRef.current.nodes = nodes;
    stateRef.current.edges = edges;
  }, [projects, memoriesByProject]);

  // ── Main animation loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // DPI-aware resize
    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      stateRef.current.w = rect.width;
      stateRef.current.h = rect.height;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ctx = canvas.getContext("2d");

    function tick() {
      const { nodes, edges, w, h } = stateRef.current;
      const reduced = reducedMotion.current;

      if (!reduced) {
        // Build index for O(1) lookups
        const nodeMap = {};
        for (const n of nodes) nodeMap[n.id] = n;

        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist2 = dx * dx + dy * dy + 1;
            const dist  = Math.sqrt(dist2);
            const force = REPULSION / dist2 * DT;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;  a.vy -= fy;
            b.vx += fx;  b.vy += fy;
          }
        }

        // Spring attraction along edges
        for (const edge of edges) {
          const a = nodeMap[edge.from];
          const b = nodeMap[edge.to];
          if (!a || !b) continue;
          const dx   = b.x - a.x;
          const dy   = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const stretch = (dist - SPRING_REST) * SPRING_K * DT;
          const fx = (dx / dist) * stretch;
          const fy = (dy / dist) * stretch;
          a.vx += fx;  a.vy += fy;
          b.vx -= fx;  b.vy -= fy;
        }

        // Gentle center gravity
        const cx = w / 2, cy = h / 2;
        for (const n of nodes) {
          n.vx += (cx - n.x) * CENTER_GRAVITY * DT;
          n.vy += (cy - n.y) * CENTER_GRAVITY * DT;
        }

        // Integrate positions + damp + clamp
        for (const n of nodes) {
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x  = Math.max(n.radius + 5, Math.min(w - n.radius - 5, n.x + n.vx));
          n.y  = Math.max(n.radius + 5, Math.min(h - n.radius - 5, n.y + n.vy));
          // Decay pulse
          if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.012);
        }
      }

      // ── Draw ─────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      const nodeMap2 = {};
      for (const n of nodes) nodeMap2[n.id] = n;
      const hoverId = hoverRef.current;
      const highlights = highlightRef.current;

      // Edges — draw highlighted ones last (on top)
      const normalEdges = [], hotEdges = [];
      for (const edge of edges) {
        const a = nodeMap2[edge.from];
        const b = nodeMap2[edge.to];
        if (!a || !b) continue;
        const hot = a.id === hoverId || b.id === hoverId ||
                    highlights.has(String(a.rawId)) || highlights.has(String(b.rawId));
        (hot ? hotEdges : normalEdges).push({ a, b });
      }

      ctx.lineWidth = 1;
      for (const { a, b } of normalEdges) {
        ctx.strokeStyle = `rgba(0,212,255,${EDGE_ALPHA})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (const { a, b } of hotEdges) {
        ctx.strokeStyle = `rgba(0,212,255,${EDGE_HIGHLIGHT})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Nodes
      for (const n of nodes) {
        const isHovered    = n.id === hoverId;
        const isHighlighted = highlights.has(String(n.rawId));
        const pulseExtra   = n.pulse * n.radius * 0.6;

        // Glow
        if (isHighlighted || isHovered || n.pulse > 0.05) {
          const glowRadius = n.radius + 10 + pulseExtra;
          const grad = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, glowRadius);
          grad.addColorStop(0, n.color + "66");
          grad.addColorStop(1, n.color + "00");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + (isHovered ? 2 : 0), 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted || isHovered
          ? n.color
          : (n.kind === "project" ? n.color : n.color + "CC");
        ctx.fill();

        // Project hub ring
        if (n.kind === "project") {
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 1;
        }

        // Label (projects always; memories on hover/highlight)
        const showLabel = n.kind === "project" || isHovered || isHighlighted;
        if (showLabel) {
          ctx.font = n.kind === "project"
            ? "bold 11px 'Space Grotesk', system-ui, sans-serif"
            : "10px 'Space Grotesk', system-ui, sans-serif";
          ctx.fillStyle = LABEL_COLOR;
          ctx.textAlign = "center";
          const labelY = n.y + n.radius + 14;
          const maxLen = 22;
          const text = n.label.length > maxLen ? n.label.slice(0, maxLen - 1) + "…" : n.label;
          ctx.fillText(text, n.x, labelY);
        }
      }

      // Tooltip for hovered node
      if (hoverId) {
        const hn = nodeMap2[hoverId];
        if (hn) drawTooltip(ctx, hn, w, h);
      }

      ctx.textAlign = "left"; // Reset
    }

    function loop() {
      tick();
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []); // Animation loop starts once — data flows in via refs

  // ── Interaction: hover + click ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getHit(e) {
      const rect  = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const n of stateRef.current.nodes) {
        const dx = mx - n.x, dy = my - n.y;
        if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
      }
      return null;
    }

    function onMove(e) {
      const hit = getHit(e);
      hoverRef.current = hit ? hit.id : null;
      canvas.style.cursor = hit ? "pointer" : "default";
    }

    function onClick(e) {
      const hit = getHit(e);
      if (hit && onNodeClick) onNodeClick(hit);
    }

    canvas.addEventListener("mousemove", onMove, { passive: true });
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [onNodeClick]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!projects.length) {
    return (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12,
          color: "var(--muted)", fontSize: "0.9rem",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
          <circle cx="24" cy="24" r="6" fill="currentColor" opacity="0.3" />
          <circle cx="10" cy="16" r="3" fill="currentColor" opacity="0.25" />
          <circle cx="38" cy="16" r="3" fill="currentColor" opacity="0.25" />
          <circle cx="10" cy="32" r="3" fill="currentColor" opacity="0.25" />
          <circle cx="38" cy="32" r="3" fill="currentColor" opacity="0.25" />
        </svg>
        <span>Create a project and add memories to see your Brain</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", borderRadius: "inherit" }}
      aria-label="Memory neural graph — interactive visualization of your projects and memory cards"
      role="img"
    />
  );
}

// ── Tooltip painter ──────────────────────────────────────────────────────────

function drawTooltip(ctx, node, canvasW, canvasH) {
  const lines = [node.label];
  if (node.kind === "memory" && node.type) lines.push(`type: ${node.type}`);
  if (node.kind === "project") lines.push("project hub");
  if (node.created) {
    try {
      lines.push(new Date(node.created).toLocaleDateString());
    } catch { /* ok */ }
  }

  const PAD = 10, LINE_H = 16;
  const maxLen = Math.max(...lines.map((l) => l.length));
  ctx.font = "11px 'Space Grotesk', system-ui, sans-serif";
  const textW   = ctx.measureText("M").width * maxLen * 0.58; // rough
  const boxW    = Math.min(textW + PAD * 2, 200);
  const boxH    = lines.length * LINE_H + PAD * 1.5;

  let bx = node.x + node.radius + 8;
  let by = node.y - boxH / 2;
  if (bx + boxW > canvasW - 5) bx = node.x - node.radius - boxW - 8;
  by = Math.max(4, Math.min(by, canvasH - boxH - 4));

  ctx.fillStyle = TOOLTIP_BG;
  ctx.strokeStyle = node.color + "88";
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(226,238,249,0.9)";
  lines.forEach((line, i) => {
    const shortened = line.length > 28 ? line.slice(0, 27) + "…" : line;
    ctx.fillText(shortened, bx + PAD, by + PAD + i * LINE_H);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
