"use client";

/**
 * BrainGraph — force-directed neural graph canvas.
 *
 * Entirely canvas-based, zero external deps, no React state updates during
 * the animation loop (all mutable state lives in refs).
 *
 * Props
 * ─────
 * projects           { id, name, created_at }[]
 * memoriesByProject  Record<projectId, { id, type, title, content, created_at }[]>
 * highlightIds       string[]   memory IDs to highlight (from recall results)
 * onNodeClick        (node) => void
 */

import { useEffect, useRef } from "react";

// ── Palette ──────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  decision: "#00D4FF",
  finding: "#A78BFA",
  definition: "#00E5A0",
  note: "#FFB800",
  link: "#FF6B6B",
  todo: "#F472B6",
  chat: "#38BDF8",
  doc: "#6EE7B7",
  code: "#FCD34D",
};
const PROJECT_COLOR = "#00D4FF";
const BG = "#060C18";
const LABEL_COLOR = "rgba(226,238,249,0.8)";
const MUTED_LABEL = "rgba(100,140,180,0.7)";
const MAX_NODES = 150;

// ── Physics ───────────────────────────────────────────────────────────────────
const REPULSION = 3200;
const SPRING_REST = 110;
const SPRING_K = 0.015;
const GRAVITY = 0.0025;
const DAMPING = 0.88;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbaStr(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function buildGraph(projects, memoriesByProject, W, H) {
  const nodes = [], edges = [];
  const perProject = Math.max(2, Math.floor(MAX_NODES / Math.max(1, projects.length)));

  // Spread project hubs in a biological pattern
  const cx = W / 2, cy = H / 2;
  const hubR = Math.min(W, H) * 0.25;

  projects.forEach((p, pi) => {
    // Distribute project nodes evenly
    const angle = (pi / projects.length) * Math.PI * 2 - Math.PI / 2;
    const hx = cx + Math.cos(angle) * hubR;
    const hy = cy + Math.sin(angle) * hubR;

    nodes.push({
      id: `proj-${p.id}`,
      kind: "project",
      label: p.name,
      rawId: p.id,
      baseX: hx, baseY: hy,
      x: hx, y: hy,
      radius: 18,
      color: PROJECT_COLOR,
      pulse: Math.random() * Math.PI * 2, // phase offset for breathing
      hitPulse: 0,
      created: p.created_at,
    });

    const mems = (memoriesByProject[p.id] || []).slice(0, perProject);
    mems.forEach((m, mi) => {
      // Golden ratio phyllotaxis pattern around each hub for memories
      const phi = mi * 137.5 * (Math.PI / 180);
      const rad = 35 + Math.sqrt(mi) * 12; // Outward spiral

      const nx = hx + Math.cos(phi) * rad;
      const ny = hy + Math.sin(phi) * rad;

      nodes.push({
        id: `mem-${m.id}`,
        kind: "memory",
        label: m.title || m.content?.slice(0, 35) || m.type,
        rawId: m.id,
        projId: `proj-${p.id}`,
        type: m.type,
        baseX: nx, baseY: ny,
        x: nx, y: ny,
        radius: 6,
        color: TYPE_COLORS[m.type] || "#4A6685",
        pulse: Math.random() * Math.PI * 2,
        hitPulse: 0,
        created: m.created_at,
      });
      edges.push({ from: `proj-${p.id}`, to: `mem-${m.id}`, length: rad });
    });
  });

  // Create static synapse particles along edges
  const synapses = edges.map(e => ({
    from: e.from,
    to: e.to,
    progress: Math.random(),
    speed: 0.002 + Math.random() * 0.005,
    active: Math.random() > 0.5 // only some edges are firing at a given time
  }));

  return { nodes, edges, synapses };
}

function buildStars(count, W, H) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.2 + 0.3,
    a: Math.random() * 0.25 + 0.05,
    vx: (Math.random() - 0.5) * 0.05,
    vy: (Math.random() - 0.5) * 0.05,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrainGraph({
  projects = [],
  memoriesByProject = {},
  highlightIds = [],
  onNodeClick,
  filterTypes = null,   // Set<string> | null — null means show all
  pauseAnimation = false,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ nodes: [], edges: [], synapses: [], stars: [], w: 800, h: 500 });
  const hoverRef = useRef(null);
  const highlightRef = useRef(new Set(highlightIds));
  const reducedRef = useRef(false);
  const pauseRef = useRef(pauseAnimation);
  const filterRef = useRef(filterTypes);
  const timeRef = useRef(0);

  // Sync pause + filter via refs so the animation loop picks them up without restart
  useEffect(() => { pauseRef.current = pauseAnimation; }, [pauseAnimation]);
  useEffect(() => { filterRef.current = filterTypes; }, [filterTypes]);

  // Sync highlight set
  useEffect(() => {
    highlightRef.current = new Set(highlightIds.map(String));
    stateRef.current.nodes.forEach((n) => {
      if (n.kind === "memory" && highlightRef.current.has(String(n.rawId))) {
        n.hitPulse = 1.0;
      }
    });
  }, [highlightIds]);

  // Rebuild graph when data changes
  useEffect(() => {
    if (!projects.length) return;
    const { w, h } = stateRef.current;
    const W = w || 800, H = h || 500;
    const { nodes, edges, synapses } = buildGraph(projects, memoriesByProject, W, H);
    // Clamp to canvas bounds
    nodes.forEach((n) => {
      n.baseX = Math.max(n.radius + 5, Math.min(W - n.radius - 5, n.baseX));
      n.baseY = Math.max(n.radius + 5, Math.min(H - n.radius - 5, n.baseY));
      n.x = n.baseX;
      n.y = n.baseY;
    });
    stateRef.current.nodes = nodes;
    stateRef.current.edges = edges;
    stateRef.current.synapses = synapses;
    stateRef.current.stars = buildStars(50, W, H);
  }, [projects, memoriesByProject]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stateRef.current.w = rect.width;
      stateRef.current.h = rect.height;
      // Rebuild stars for new size
      stateRef.current.stars = buildStars(50, rect.width, rect.height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ctx = canvas.getContext("2d");

    function tick() {
      timeRef.current += 0.016;
      const t = timeRef.current;
      const { nodes, edges, synapses, stars, w: W, h: H } = stateRef.current;
      const paused = pauseRef.current || reducedRef.current;
      const ftypes = filterRef.current; // Set<string> | null

      // ── Animate ─────────────────────────────────────────────────────────────
      if (!paused && nodes.length) {

        // Gentle breathing motion and hit pulse decay
        for (const n of nodes) {
          // Slow organic hover
          n.x = n.baseX + Math.sin(t * 0.5 + n.pulse) * 4;
          n.y = n.baseY + Math.cos(t * 0.4 + n.pulse) * 4;

          if (n.hitPulse > 0) n.hitPulse = Math.max(0, n.hitPulse - 0.008);
        }

        // Animate synapses
        for (const syn of synapses) {
          if (syn.active) {
            syn.progress += syn.speed;
            if (syn.progress >= 1.0) {
              syn.progress = 0;
              syn.active = Math.random() > 0.4; // 60% chance to pause
            }
          } else {
            if (Math.random() < 0.005) syn.active = true; // chance to activate
          }
        }

        // Drift stars
        for (const s of stars) {
          s.x = (s.x + s.vx + W) % W;
          s.y = (s.y + s.vy + H) % H;
        }
      }

      // When paused, still advance time slowly for subtle pulse (not physics)
      if (paused) timeRef.current -= 0.014; // net +0.002/frame

      // ── Draw ─────────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Ambient center glow
      {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.5);
        g.addColorStop(0, "rgba(0,212,255,0.04)");
        g.addColorStop(1, "rgba(0,212,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Stars
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148,173,200,${s.a})`;
        ctx.fill();
      }

      if (!nodes.length) return;

      const nm2 = {};
      for (const n of nodes) nm2[n.id] = n;
      const hoverId = hoverRef.current;
      const highlights = highlightRef.current;

      // ── Edges ─────────────────────────────────────────────────────────────────
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = nm2[e.from], b = nm2[e.to];
        if (!a || !b) continue;

        const bMuted = ftypes !== null && b.kind === "memory" && !ftypes.has(b.type);
        if (bMuted) {
          ctx.strokeStyle = "rgba(0,212,255,0.04)";
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          continue;
        }

        const aHot = a.id === hoverId || highlights.has(String(a.rawId));
        const bHot = b.id === hoverId || highlights.has(String(b.rawId));
        const hot = aHot || bHot || a.id === hoverId || b.id === hoverId;

        if (hot) {
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, rgbaStr(a.color, 0.55));
          grad.addColorStop(1, rgbaStr(b.color, 0.55));
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = "rgba(0,212,255,0.09)";
          ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // ── Synapses ─────────────────────────────────────────────────────────────
      for (const syn of synapses) {
        if (!syn.active) continue;
        const a = nm2[syn.from], b = nm2[syn.to];
        if (!a || !b) continue;
        const bMuted = ftypes !== null && b.kind === "memory" && !ftypes.has(b.type);
        if (bMuted) continue;

        // Draw particle traveling from a to b
        const px = a.x + (b.x - a.x) * syn.progress;
        const py = a.y + (b.y - a.y) * syn.progress;

        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = rgbaStr(b.color, 0.8 * (1 - Math.abs(syn.progress - 0.5) * 2)); // fade at edges
        ctx.fill();

        // Synapse glow
        const g = ctx.createRadialGradient(px, py, 0, px, py, 6);
        g.addColorStop(0, rgbaStr(b.color, 0.8));
        g.addColorStop(1, rgbaStr(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Nodes ─────────────────────────────────────────────────────────────────
      for (const n of nodes) {
        const isHover = n.id === hoverId;
        const isHot = highlights.has(String(n.rawId));

        // Type filter: dim nodes whose type is not in the active filter set
        // Project hubs are never dimmed; null filterTypes = no filter
        const typeMuted = ftypes !== null && n.kind === "memory" && !ftypes.has(n.type);
        const dimAlpha = typeMuted ? 0.12 : 1.0;

        const breath = n.kind === "project" ? 0.12 * Math.sin(t * 1.4 + n.pulse) : 0;
        const baseR = n.radius + (isHover && !typeMuted ? 3 : 0) + breath;
        const hp = n.hitPulse;

        // Hit pulse ring
        if (hp > 0.01) {
          const ringR = baseR + hp * baseR * 2.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = rgbaStr(n.color, hp * 0.6);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Glow halo — skip for muted nodes
        if (!typeMuted && (isHot || isHover || hp > 0.05)) {
          const glowR = baseR + 18 + hp * 10;
          const g = ctx.createRadialGradient(n.x, n.y, baseR * 0.4, n.x, n.y, glowR);
          g.addColorStop(0, rgbaStr(n.color, (isHot ? 0.35 : 0.22) + hp * 0.2));
          g.addColorStop(1, rgbaStr(n.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node fill — radial gradient for depth
        const fillAlpha = (isHot || isHover ? 1.0 : 0.85) * dimAlpha;
        const fillG = ctx.createRadialGradient(
          n.x - baseR * 0.3, n.y - baseR * 0.3, 0,
          n.x, n.y, baseR * 1.3,
        );
        fillG.addColorStop(0, rgbaStr(n.color, fillAlpha));
        fillG.addColorStop(1, rgbaStr(n.color, fillAlpha * 0.55));
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseR, 0, Math.PI * 2);
        ctx.fillStyle = fillG;
        ctx.fill();

        // Project ring
        if (n.kind === "project") {
          ctx.strokeStyle = rgbaStr(n.color, 0.45 + 0.15 * Math.sin(t * 1.4 + n.pulse));
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Labels — hide for muted nodes unless hovered
        const showLabel = (!typeMuted || isHover) && (n.kind === "project" || isHover || isHot);
        if (showLabel) {
          const text = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
          const lY = n.y + baseR + 14;
          ctx.font = n.kind === "project"
            ? `bold 11px "Space Grotesk", system-ui, sans-serif`
            : `10px "Space Grotesk", system-ui, sans-serif`;

          // Shadow
          ctx.shadowColor = n.kind === "project" ? rgbaStr(n.color, 0.6) : "transparent";
          ctx.shadowBlur = n.kind === "project" ? 8 : 0;
          ctx.fillStyle = n.kind === "project" ? LABEL_COLOR : MUTED_LABEL;
          ctx.textAlign = "center";
          ctx.fillText(text, n.x, lY);
          ctx.shadowBlur = 0;
        }
      }

      ctx.textAlign = "left";
      ctx.lineWidth = 1;

      // ── Hover tooltip ──────────────────────────────────────────────────────────
      if (hoverId && nm2[hoverId]) {
        drawTooltip(ctx, nm2[hoverId], W, H);
      }
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
  }, []); // start once on mount — data flows via refs

  // ── Mouse events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getHit = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const n of stateRef.current.nodes) {
        const dx = mx - n.x, dy = my - n.y;
        if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) return n;
      }
      return null;
    };

    const onMove = (e) => {
      const hit = getHit(e);
      hoverRef.current = hit ? hit.id : null;
      canvas.style.cursor = hit ? "pointer" : "default";
    };
    const onClick = (e) => {
      const hit = getHit(e);
      if (hit && onNodeClick) onNodeClick(hit);
    };

    canvas.addEventListener("mousemove", onMove, { passive: true });
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [onNodeClick]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!projects.length) {
    return (
      <EmptyBrain />
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

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyBrain() {
  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16,
        background: "#060C18",
      }}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="30" stroke="rgba(0,212,255,0.15)" strokeWidth="1.5" strokeDasharray="5 4" />
        <circle cx="32" cy="32" r="18" stroke="rgba(0,212,255,0.08)" strokeWidth="1" />
        <circle cx="32" cy="32" r="5" fill="rgba(0,212,255,0.25)" />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x = 32 + Math.cos(rad) * 24;
          const y = 32 + Math.sin(rad) * 24;
          return (
            <g key={deg}>
              <line x1="32" y1="32" x2={x} y2={y} stroke="rgba(0,212,255,0.12)" strokeWidth="1" />
              <circle cx={x} cy={y} r="3" fill="rgba(0,212,255,0.2)" />
            </g>
          );
        })}
      </svg>
      <p style={{ color: "rgba(100,140,180,0.7)", fontSize: "0.875rem", textAlign: "center", margin: 0 }}>
        Create a project and add memories<br />to see your Brain come alive.
      </p>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function drawTooltip(ctx, n, W, H) {
  const lines = [];
  const maxLabelLen = 36;
  lines.push(n.label.length > maxLabelLen ? n.label.slice(0, maxLabelLen - 1) + "…" : n.label);
  if (n.kind === "memory" && n.type) lines.push(`type: ${n.type}`);
  else if (n.kind === "project") lines.push("project hub");
  if (n.created) {
    try { lines.push(new Date(n.created).toLocaleDateString()); } catch { /* ok */ }
  }

  const FONT = "11px 'Space Grotesk', system-ui, sans-serif";
  ctx.font = FONT;

  const PAD = 10;
  const LH = 17;
  const boxW = Math.min(Math.max(...lines.map((l) => ctx.measureText(l).width)) + PAD * 2, 220);
  const boxH = lines.length * LH + PAD * 1.4;

  let bx = n.x + n.radius + 10;
  let by = n.y - boxH / 2;
  if (bx + boxW > W - 6) bx = n.x - n.radius - boxW - 10;
  by = Math.max(4, Math.min(by, H - boxH - 4));

  // Glass panel
  ctx.shadowBlur = 16;
  ctx.shadowColor = rgbaStr(n.color, 0.3);
  ctx.fillStyle = "rgba(10,20,36,0.92)";
  roundRect(ctx, bx, by, boxW, boxH, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = rgbaStr(n.color, 0.4);
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 8);
  ctx.stroke();

  // Text
  ctx.fillStyle = "rgba(226,238,249,0.9)";
  ctx.font = FONT;
  lines.forEach((line, i) => {
    if (i === 0) ctx.fillStyle = "rgba(226,238,249,0.95)";
    else ctx.fillStyle = "rgba(100,140,180,0.75)";
    ctx.fillText(line, bx + PAD, by + PAD + i * LH + LH * 0.75);
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
