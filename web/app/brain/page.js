"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const router  = useRouter();
  const toast   = useToast();

  const [loading, setLoading]       = useState(true);
  const [projects, setProjects]     = useState([]);
  const [memoriesByProject, setMemoriesByProject] = useState({});
  const [selectedNode, setSelectedNode]   = useState(null);
  const [highlightIds, setHighlightIds]   = useState([]);
  const [recallQuery, setRecallQuery]     = useState("");
  const [recalling, setRecalling]         = useState(false);
  const [stats, setStats]                 = useState({ projects: 0, memories: 0, edges: 0 });

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        await apiFetch("/auth/me"); // redirect if not logged in
        const projs = await apiFetch("/projects");
        setProjects(projs);

        // Load memories for all projects in parallel (cap at 8 projects for perf)
        const slice = projs.slice(0, 8);
        const results = await Promise.allSettled(
          slice.map((p) => apiFetch(`/projects/${p.id}/memories`))
        );

        const byProject = {};
        let totalMem = 0;
        slice.forEach((p, i) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            byProject[p.id] = r.value;
            totalMem += r.value.length;
          } else {
            byProject[p.id] = [];
          }
        });

        setMemoriesByProject(byProject);
        setStats({
          projects: projs.length,
          memories: totalMem,
          edges: totalMem, // one edge per memory → project
        });
      } catch (err) {
        if (err instanceof ApiError && err.kind === "auth") {
          router.replace("/auth?reason=expired");
          return;
        }
        toast.error(err.message || "Failed to load brain data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, toast]);

  // ── Recall — highlight matching memory nodes ───────────────────────────────
  async function runRecall(e) {
    e?.preventDefault();
    if (!recallQuery.trim() || recalling) return;
    setRecalling(true);
    setHighlightIds([]);

    try {
      // Find the project with the most memories — or recall across first project
      const projectIds = Object.keys(memoriesByProject).filter(
        (id) => memoriesByProject[id]?.length > 0
      );
      if (!projectIds.length) {
        toast.warn("No memories found to search.");
        return;
      }

      // Run recall on the first project (or all if multiple)
      const recallResults = await Promise.allSettled(
        projectIds.slice(0, 3).map((id) =>
          apiFetch(`/projects/${id}/recall?query=${encodeURIComponent(recallQuery)}&limit=10`)
        )
      );

      const ids = [];
      recallResults.forEach((r) => {
        if (r.status === "fulfilled") {
          (r.value.items || []).forEach((item) => ids.push(String(item.id)));
        }
      });

      setHighlightIds(ids);
      if (ids.length) {
        toast.success(`${ids.length} memor${ids.length === 1 ? "y" : "ies"} lit up.`);
      } else {
        toast.info("No matching memories found.");
      }
    } catch (err) {
      toast.error(err.message || "Recall failed.");
    } finally {
      setRecalling(false);
    }
  }

  function clearHighlights() {
    setHighlightIds([]);
    setRecallQuery("");
  }

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  // ── Legend data ───────────────────────────────────────────────────────────
  const usedTypes = new Set(
    Object.values(memoriesByProject).flat().map((m) => m.type).filter(Boolean)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", gap: 0 }}>

      {/* ── Top bar ── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          padding: "12px 20px",
          background: "var(--panel)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--display)", fontSize: "1.1rem",
              letterSpacing: "0.06em", margin: 0, color: "var(--brand)",
            }}
          >
            BRAIN
          </h1>
          <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
            {stats.projects} project{stats.projects !== 1 ? "s" : ""} ·{" "}
            {stats.memories} memor{stats.memories !== 1 ? "ies" : "y"} ·{" "}
            {stats.edges} edge{stats.edges !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Recall query */}
        <form
          onSubmit={runRecall}
          style={{ display: "flex", gap: 8, flexGrow: 1, maxWidth: 420 }}
        >
          <input
            value={recallQuery}
            onChange={(e) => setRecallQuery(e.target.value)}
            placeholder="Recall query — lights up matching nodes…"
            style={{ flexGrow: 1, fontSize: "0.85rem" }}
            disabled={recalling}
            aria-label="Recall query"
          />
          <button
            type="submit"
            className="btn secondary sm"
            disabled={!recallQuery.trim() || recalling}
          >
            {recalling ? "…" : "Search"}
          </button>
          {highlightIds.length > 0 && (
            <button type="button" className="btn ghost sm" onClick={clearHighlights}>
              Clear
            </button>
          )}
        </form>

        {/* Stats chips */}
        {highlightIds.length > 0 && (
          <span
            style={{
              padding: "2px 10px", borderRadius: 999,
              background: "rgba(0,212,255,0.12)",
              border: "1px solid rgba(0,212,255,0.3)",
              color: "var(--brand)", fontSize: "0.78rem",
              fontFamily: "var(--mono)",
            }}
          >
            {highlightIds.length} highlighted
          </span>
        )}

        <Link href="/app" className="btn ghost sm" style={{ marginLeft: "auto" }}>
          ← App
        </Link>
      </div>

      {/* ── Canvas area + right panel ── */}
      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>

        {/* Graph canvas */}
        <div
          style={{
            flexGrow: 1,
            background: "#060C18",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--muted)", fontSize: "0.9rem", flexDirection: "column", gap: 12,
              }}
            >
              <span
                style={{
                  width: 32, height: 32, border: "2px solid var(--brand)",
                  borderTopColor: "transparent", borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                }}
              />
              Loading brain…
            </div>
          ) : (
            <BrainGraph
              projects={projects}
              memoriesByProject={memoriesByProject}
              highlightIds={highlightIds}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* Right panel: legend + selected node info */}
        <aside
          style={{
            width: 220, flexShrink: 0,
            background: "var(--panel)",
            borderLeft: "1px solid var(--line)",
            padding: "16px 14px",
            overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 20,
          }}
        >
          {/* Legend */}
          <div>
            <p
              className="label"
              style={{ marginBottom: 10, fontSize: "0.7rem", letterSpacing: "0.08em" }}
            >
              NODE TYPES
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#00D4FF",
                    border: "2px solid rgba(255,255,255,0.25)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "0.78rem", color: "var(--ink-2)" }}>Project hub</span>
              </div>

              {Object.entries(TYPE_COLORS).map(([type, color]) => {
                if (!usedTypes.has(type)) return null;
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: color, flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "0.78rem", color: "var(--ink-2)", fontFamily: "var(--mono)" }}>
                      {type}
                    </span>
                  </div>
                );
              })}

              {usedTypes.size === 0 && !loading && (
                <span className="muted" style={{ fontSize: "0.75rem" }}>No memories yet</span>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <p className="label" style={{ marginBottom: 8, fontSize: "0.7rem", letterSpacing: "0.08em" }}>
              CONTROLS
            </p>
            <ul
              style={{
                fontSize: "0.75rem", color: "var(--muted)", lineHeight: 1.8,
                paddingLeft: 14, margin: 0,
              }}
            >
              <li>Hover a node — see label &amp; tooltip</li>
              <li>Click a node — view details below</li>
              <li>Use Recall — highlight matches</li>
              <li>Nodes drift apart &amp; reconnect live</li>
            </ul>
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div>
              <p
                className="label"
                style={{ marginBottom: 8, fontSize: "0.7rem", letterSpacing: "0.08em" }}
              >
                SELECTED
              </p>
              <div
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm, 8px)",
                  padding: "10px 12px",
                  fontSize: "0.8rem",
                }}
              >
                <p style={{ margin: "0 0 4px", fontWeight: 600, color: selectedNode.color || "var(--ink)" }}>
                  {selectedNode.kind === "project" ? "📁" : "🧠"}{" "}
                  {selectedNode.label.length > 40
                    ? selectedNode.label.slice(0, 39) + "…"
                    : selectedNode.label}
                </p>
                <p className="muted" style={{ margin: "0 0 4px", fontSize: "0.73rem", fontFamily: "var(--mono)" }}>
                  {selectedNode.kind} · id {selectedNode.rawId}
                </p>
                {selectedNode.type && (
                  <p style={{ margin: 0, fontSize: "0.73rem", color: TYPE_COLORS[selectedNode.type] || "var(--muted)" }}>
                    {selectedNode.type}
                  </p>
                )}
                {selectedNode.created && (
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.72rem" }}>
                    {new Date(selectedNode.created).toLocaleString()}
                  </p>
                )}
                <button
                  className="btn ghost sm"
                  style={{ marginTop: 8, fontSize: "0.72rem" }}
                  onClick={() => setSelectedNode(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Keyframe for the loading spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
