"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import BrainGraph from "../components/BrainGraph";

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

export default function BrainPage() {
  const router = useRouter();
  const toast  = useToast();

  // Stable refs — used inside the one-shot useEffect so we never need to re-run it
  const routerRef = useRef(router);
  const toastRef  = useRef(toast);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { toastRef.current  = toast;  }, [toast]);

  const [loading,   setLoading]   = useState(true);
  const [projects,  setProjects]  = useState([]);
  const [memoriesByProject, setMemoriesByProject] = useState({});
  const [selectedNode,  setSelectedNode]  = useState(null);
  const [highlightIds,  setHighlightIds]  = useState([]);
  const [recallQuery,   setRecallQuery]   = useState("");
  const [recalling,     setRecalling]     = useState(false);
  const [stats, setStats] = useState({ projects: 0, memories: 0, edges: 0 });

  // Animation: default to paused when OS prefers reduced motion
  const [animPaused, setAnimPaused] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  // Type filter: null = show all, Set = show only these types
  const [activeTypes, setActiveTypes] = useState(null); // null means "all"

  function toggleType(type) {
    setActiveTypes((prev) => {
      // First click on any type while "all" → start filter with just that type
      if (prev === null) return new Set([type]);
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        // If nothing left, reset to "all"
        return next.size === 0 ? null : next;
      }
      next.add(type);
      return next;
    });
  }

  function clearTypeFilter() { setActiveTypes(null); }

  // ── One-shot data load — no unstable deps ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await apiFetch("/auth/me");
        const projs = await apiFetch("/projects");
        if (cancelled) return;
        setProjects(projs);

        const slice = projs.slice(0, 8);
        const results = await Promise.allSettled(
          slice.map((p) => apiFetch(`/projects/${p.id}/memories`)),
        );
        if (cancelled) return;

        const byProject = {};
        let totalMem = 0;
        slice.forEach((p, i) => {
          const r = results[i];
          byProject[p.id] = r.status === "fulfilled" ? r.value : [];
          totalMem += byProject[p.id].length;
        });

        setMemoriesByProject(byProject);
        setStats({ projects: projs.length, memories: totalMem, edges: totalMem });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind === "auth") {
          routerRef.current.replace("/auth?reason=expired");
          return;
        }
        toastRef.current.error(err.message || "Failed to load brain data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // intentionally empty — refs keep router/toast current

  // ── Cross-project recall → highlight nodes ────────────────────────────────
  async function runRecall(e) {
    e?.preventDefault();
    if (!recallQuery.trim() || recalling) return;
    setRecalling(true);
    setHighlightIds([]);

    try {
      const projectIds = Object.keys(memoriesByProject).filter(
        (id) => (memoriesByProject[id]?.length ?? 0) > 0,
      );
      if (!projectIds.length) {
        toast.warn("No memories to search.");
        return;
      }

      const recalls = await Promise.allSettled(
        projectIds.slice(0, 4).map((id) =>
          apiFetch(`/projects/${id}/recall?query=${encodeURIComponent(recallQuery)}&limit=10`),
        ),
      );

      const ids = [];
      recalls.forEach((r) => {
        if (r.status === "fulfilled") {
          (r.value.items || []).forEach((item) => ids.push(String(item.id)));
        }
      });

      setHighlightIds(ids);
      if (ids.length) {
        toast.success(`${ids.length} memor${ids.length === 1 ? "y" : "ies"} highlighted.`);
      } else {
        toast.info("No matching memories found.");
      }
    } catch (err) {
      toast.error(err.message || "Recall failed.");
    } finally {
      setRecalling(false);
    }
  }

  const handleNodeClick = useCallback((node) => setSelectedNode(node), []);

  const usedTypes = [...new Set(
    Object.values(memoriesByProject).flat().map((m) => m.type).filter(Boolean),
  )];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 60px)",
        background: "#060C18",
        overflow: "hidden",
      }}
    >

      {/* ── Command bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "10px 18px",
          background: "rgba(13,27,46,0.95)",
          borderBottom: "1px solid rgba(0,212,255,0.1)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 2,
        }}
      >
        {/* Title */}
        <div style={{ userSelect: "none", flexShrink: 0 }}>
          <span
            style={{
              fontFamily: "var(--display, 'Orbitron', monospace)",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#00D4FF",
              textShadow: "0 0 18px rgba(0,212,255,0.5)",
            }}
          >
            BRAIN
          </span>
          <span
            style={{
              marginLeft: 10,
              fontSize: "0.73rem",
              color: "rgba(100,140,180,0.6)",
              fontFamily: "var(--mono, monospace)",
            }}
          >
            {stats.projects}P · {stats.memories}M · {stats.edges}E
          </span>
        </div>

        {/* Recall search */}
        <form
          onSubmit={runRecall}
          style={{ display: "flex", gap: 6, flexGrow: 1, maxWidth: 400 }}
        >
          <input
            value={recallQuery}
            onChange={(e) => setRecallQuery(e.target.value)}
            placeholder="Search memories — matching nodes will glow…"
            style={{
              flexGrow: 1,
              fontSize: "0.82rem",
              background: "rgba(6,12,24,0.7)",
              border: "1px solid rgba(0,212,255,0.18)",
              borderRadius: "var(--radius, 12px)",
              color: "rgba(226,238,249,0.9)",
              padding: "7px 12px",
              outline: "none",
            }}
            disabled={recalling}
          />
          <button
            type="submit"
            className="btn secondary sm"
            disabled={!recallQuery.trim() || recalling}
            style={{ flexShrink: 0 }}
          >
            {recalling ? "…" : "Search"}
          </button>
          {highlightIds.length > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => { setHighlightIds([]); setRecallQuery(""); }}
              style={{ flexShrink: 0 }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Highlight badge */}
        {highlightIds.length > 0 && (
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.3)",
              color: "#00D4FF",
              fontSize: "0.75rem",
              fontFamily: "var(--mono, monospace)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            {highlightIds.length} lit
          </span>
        )}

        {/* Animation toggle */}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setAnimPaused((p) => !p)}
          title={animPaused ? "Resume animation" : "Pause animation"}
          style={{ flexShrink: 0, fontSize: "0.78rem", fontFamily: "var(--mono, monospace)" }}
        >
          {animPaused ? "▶ Animate" : "⏸ Pause"}
        </button>

        <Link
          href="/app"
          className="btn ghost sm"
          style={{ marginLeft: "auto", flexShrink: 0, fontSize: "0.78rem" }}
        >
          ← App
        </Link>
      </div>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden", position: "relative" }}>

        {/* Canvas */}
        <div style={{ flexGrow: 1, position: "relative", overflow: "hidden" }}>
          {loading ? (
            <LoadingBrain />
          ) : projects.length === 0 ? (
            <EmptyBrain />
          ) : (
            <BrainGraph
              projects={projects}
              memoriesByProject={memoriesByProject}
              highlightIds={highlightIds}
              onNodeClick={handleNodeClick}
              filterTypes={activeTypes}
              pauseAnimation={animPaused}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside
          style={{
            width: 200,
            flexShrink: 0,
            background: "rgba(10,20,36,0.92)",
            borderLeft: "1px solid rgba(0,212,255,0.09)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            padding: "16px 12px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            zIndex: 1,
          }}
        >
          {/* Legend / type filter */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p
                style={{
                  fontSize: "0.65rem",
                  letterSpacing: "0.1em",
                  color: "rgba(100,140,180,0.55)",
                  fontFamily: "var(--mono, monospace)",
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                NODE TYPES
              </p>
              {activeTypes !== null && (
                <button
                  onClick={clearTypeFilter}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "0.62rem", color: "rgba(0,212,255,0.7)",
                    fontFamily: "var(--mono, monospace)", padding: 0,
                  }}
                  title="Show all types"
                >
                  reset
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {/* Project hub row — not filterable */}
              <LegendItem color="#00D4FF" label="project hub" ring active />
              {usedTypes.map((type) => {
                const isActive = activeTypes === null || activeTypes.has(type);
                return (
                  <LegendItem
                    key={type}
                    color={TYPE_COLORS[type] || "#4A6685"}
                    label={type}
                    active={isActive}
                    onClick={() => toggleType(type)}
                  />
                );
              })}
              {!usedTypes.length && !loading && (
                <span style={{ fontSize: "0.72rem", color: "rgba(100,140,180,0.45)" }}>
                  No memories yet
                </span>
              )}
              {usedTypes.length > 0 && (
                <p style={{ fontSize: "0.62rem", color: "rgba(100,140,180,0.38)", margin: "4px 0 0", lineHeight: 1.4 }}>
                  Click a type to filter
                </p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div>
            <p
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "rgba(100,140,180,0.55)",
                fontFamily: "var(--mono, monospace)",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              CONTROLS
            </p>
            <ul
              style={{
                fontSize: "0.72rem",
                color: "rgba(100,140,180,0.6)",
                lineHeight: 1.9,
                paddingLeft: 12,
                margin: 0,
              }}
            >
              <li>Hover — tooltip</li>
              <li>Click — select node</li>
              <li>Search — light up matches</li>
              <li>Nodes drift &amp; spring live</li>
            </ul>
          </div>

          {/* Selected node */}
          {selectedNode && (
            <SelectedCard node={selectedNode} onDismiss={() => setSelectedNode(null)} />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LegendItem({ color, label, ring, active = true, onClick }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        cursor: onClick ? "pointer" : "default",
        opacity: active ? 1 : 0.38,
        transition: "opacity 0.2s",
        borderRadius: 6,
        padding: "2px 4px",
        margin: "-2px -4px",
      }}
    >
      <div
        style={{
          width: ring ? 14 : 10,
          height: ring ? 14 : 10,
          borderRadius: "50%",
          background: ring ? `radial-gradient(circle, ${color}cc 0%, ${color}44 100%)` : color + "bb",
          border: ring ? `1.5px solid ${color}88` : "none",
          boxShadow: active ? `0 0 6px ${color}44` : "none",
          flexShrink: 0,
          transition: "box-shadow 0.2s",
        }}
      />
      <span
        style={{
          fontSize: "0.73rem",
          color: active ? "rgba(100,140,180,0.85)" : "rgba(100,140,180,0.45)",
          fontFamily: "var(--mono, monospace)",
          transition: "color 0.2s",
          userSelect: "none",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SelectedCard({ node, onDismiss }) {
  const TYPE_COLORS_MAP = {
    decision: "#00D4FF", finding: "#A78BFA", definition: "#00E5A0",
    note: "#FFB800", link: "#FF6B6B", todo: "#F472B6",
    chat: "#38BDF8", doc: "#6EE7B7", code: "#FCD34D",
  };
  const accent = TYPE_COLORS_MAP[node.type] || node.color || "#00D4FF";

  return (
    <div>
      <p
        style={{
          fontSize: "0.65rem",
          letterSpacing: "0.1em",
          color: "rgba(100,140,180,0.55)",
          fontFamily: "var(--mono, monospace)",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        SELECTED
      </p>
      <div
        style={{
          background: "rgba(6,12,24,0.6)",
          border: `1px solid ${accent}33`,
          borderRadius: 10,
          padding: "10px 11px",
          fontSize: "0.78rem",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontWeight: 600,
            color: accent,
            lineHeight: 1.4,
          }}
        >
          {node.kind === "project" ? "📁 " : "🧠 "}
          {node.label.length > 32 ? node.label.slice(0, 31) + "…" : node.label}
        </p>
        <p
          style={{
            margin: "0 0 3px",
            fontSize: "0.7rem",
            color: "rgba(100,140,180,0.6)",
            fontFamily: "var(--mono, monospace)",
          }}
        >
          {node.kind} · #{node.rawId}
        </p>
        {node.type && (
          <p style={{ margin: 0, fontSize: "0.7rem", color: accent }}>
            {node.type}
          </p>
        )}
        {node.created && (
          <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "rgba(100,140,180,0.45)" }}>
            {new Date(node.created).toLocaleString()}
          </p>
        )}
        <button
          className="btn ghost sm"
          style={{ marginTop: 8, fontSize: "0.7rem", padding: "2px 8px" }}
          onClick={onDismiss}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function LoadingBrain() {
  return (
    <div
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 14, background: "#060C18",
      }}
    >
      {/* Animated ring */}
      <div
        style={{
          width: 44, height: 44,
          border: "2px solid rgba(0,212,255,0.15)",
          borderTopColor: "#00D4FF",
          borderRadius: "50%",
          animation: "brain-spin 0.85s linear infinite",
        }}
      />
      <span
        style={{
          color: "rgba(100,140,180,0.55)",
          fontSize: "0.82rem",
          fontFamily: "var(--mono, monospace)",
          letterSpacing: "0.06em",
        }}
      >
        LOADING BRAIN
      </span>
      <style>{`@keyframes brain-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyBrain() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060C18",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          textAlign: "center",
          border: "1px solid rgba(0,212,255,0.2)",
          background: "rgba(12,22,40,0.8)",
          borderRadius: 18,
          padding: "28px 24px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: "2.1rem", marginBottom: 8 }}>🧠</div>
        <h2 style={{ margin: "0 0 6px", color: "#E2EEF9", fontSize: "1.2rem" }}>Your graph is empty</h2>
        <p style={{ margin: 0, color: "rgba(148,173,200,0.9)", lineHeight: 1.6 }}>
          Create a project and publish a few memories to light up your team brain.
        </p>
      </div>
    </div>
  );
}
