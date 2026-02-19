"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { SkeletonCard, Skeleton } from "../components/skeleton";

const MEMORY_TYPES = ["decision", "finding", "definition", "note", "link", "todo", "chat", "doc", "code"];
const MEMORY_SOURCES = ["manual", "chatgpt", "claude", "cursor", "codex", "api"];

// Dark-mode-aware type colors using the design system palette
const TYPE_COLORS = {
  decision:   { color: "#00D4FF", bg: "rgba(0,212,255,0.12)"   },
  finding:    { color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  definition: { color: "#00E5A0", bg: "rgba(0,229,160,0.12)"   },
  note:       { color: "#FFB800", bg: "rgba(255,184,0,0.12)"   },
  link:       { color: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
  todo:       { color: "#F472B6", bg: "rgba(244,114,182,0.12)" },
};

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000)      return "just now";
    if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

function TypeBadge({ type, size = "sm" }) {
  const c = TYPE_COLORS[type] || { color: "var(--muted)", bg: "var(--panel-2)" };
  return (
    <span style={{
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.color}30`,
      padding: size === "sm" ? "1px 7px" : "2px 9px",
      borderRadius: 999,
      fontSize: size === "sm" ? "0.7rem" : "0.78rem",
      fontWeight: 700,
      letterSpacing: "0.04em",
      fontFamily: "var(--mono)",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {type}
    </span>
  );
}

// ── Usage meter ─────────────────────────────────────────────────────────────

function UsageMeter({ usage, isUnlimited }) {
  const lim = usage?.limits ?? {};
  const rows = [
    { label: "memories", used: usage?.memories_created ?? 0, max: lim.memories_per_day ?? 0, color: "#00D4FF" },
    { label: "recalls",  used: usage?.recall_queries    ?? 0, max: lim.recalls_per_day   ?? 0, color: "#A78BFA" },
    { label: "projects", used: usage?.projects_created  ?? 0, max: lim.projects_per_day  ?? 0, color: "#00E5A0" },
  ];

  return (
    <div style={{
      padding: "10px 12px",
      borderTop: "1px solid var(--line)",
      marginTop: "auto",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: "0.62rem", letterSpacing: "0.1em",
          color: "var(--muted)", fontFamily: "var(--mono)", fontWeight: 700,
        }}>
          TODAY&apos;S USAGE
        </span>
        {isUnlimited && (
          <span style={{
            fontSize: "0.62rem", color: "var(--ok)",
            fontFamily: "var(--mono)", letterSpacing: "0.06em",
          }}>
            ∞ unlimited
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(({ label, used, max, color }) => {
          const pct = max > 0 && !isUnlimited ? Math.min(100, (used / max) * 100) : 0;
          const near = pct >= 80;
          const full = pct >= 100;
          return (
            <div key={label}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: "0.68rem", color: "var(--ink-2)",
                fontFamily: "var(--mono)", marginBottom: 3,
              }}>
                <span>{label}</span>
                <span style={{ color: full ? "var(--danger)" : near ? "var(--warn)" : "var(--muted)" }}>
                  {isUnlimited ? `${used} / ∞` : max > 0 ? `${used} / ${max}` : `${used}`}
                </span>
              </div>
              {max > 0 && !isUnlimited && (
                <div style={{
                  height: 3, borderRadius: 99,
                  background: "var(--panel-3)", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 99, width: `${pct}%`,
                    background: full ? "var(--danger)" : near ? "var(--warn)" : color,
                    transition: "width 0.4s ease",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AppPage() {
  const router  = useRouter();
  const toast   = useToast();

  const [loading, setLoading]         = useState(true);
  const [auth, setAuth]               = useState(null);
  const [usage, setUsage]             = useState(null);
  const [projects, setProjects]       = useState([]);
  const [projectId, setProjectId]     = useState("");
  const [tab, setTab]                 = useState("compose");
  const [projectSearch, setProjectSearch] = useState("");

  // Create project
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject]   = useState(false);

  // Memory composer
  const [memoryType, setMemoryType]       = useState("decision");
  const [memorySource, setMemorySource]   = useState("manual");
  const [memoryTitle, setMemoryTitle]     = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryTags, setMemoryTags]       = useState("");
  const [memoryMeta, setMemoryMeta]       = useState({ url: "", file_path: "", language: "", model: "" });
  const [savingMemory, setSavingMemory]   = useState(false);

  // Memories list
  const [memories, setMemories]           = useState([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  // Recall
  const [recallQuery, setRecallQuery]   = useState("");
  const [recallItems, setRecallItems]   = useState([]);
  const [memoryPack, setMemoryPack]     = useState("");
  const [recalling, setRecalling]       = useState(false);

  function handleApiError(err) {
    if (err instanceof ApiError) {
      if (err.kind === "auth")       { router.replace("/auth?reason=expired"); return; }
      if (err.kind === "forbidden")  { toast.error("You don't have permission for this action."); return; }
      if (err.kind === "rate_limit") { toast.warn("Too many requests. Please wait a moment."); return; }
      if (err.kind === "network")    { toast.error("Backend unreachable. Check server status."); return; }
    }
    toast.error(err.message || "Something went wrong.");
  }

  async function loadInitial() {
    setLoading(true);
    try {
      const [me, list, usageRes] = await Promise.all([
        apiFetch("/auth/me"),
        apiFetch("/projects"),
        apiFetch("/me/usage").catch(() => null), // non-fatal
      ]);
      setAuth(me);
      setProjects(list);
      if (list.length) setProjectId(String(list[0].id));
      if (usageRes) setUsage(usageRes);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInitial(); }, []);

  // Load memories whenever project or tab changes
  useEffect(() => {
    if (!projectId) return;
    loadMemories();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || tab !== "memories") return;
    loadMemories();
  }, [tab]);

  async function loadMemories() {
    setLoadingMemories(true);
    try {
      const items = await apiFetch(`/projects/${projectId}/memories`);
      setMemories(items);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoadingMemories(false);
    }
  }

  function selectProject(id) {
    if (id === projectId) return; // already selected — no-op
    setProjectId(id);
    setTab("compose");
    setRecallItems([]);
    setMemoryPack("");
    setRecallQuery("");
    setMemoryContent("");
    setMemoryTitle("");
    setMemoryTags("");
    setMemoryMeta({ url: "", file_path: "", language: "", model: "" });
  }

  async function createProject(e) {
    e.preventDefault();
    if (!newProjectName.trim() || creatingProject) return;
    setCreatingProject(true);
    try {
      const proj = await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      toast.success(`Project "${proj.name}" created.`);
      setNewProjectName("");
      setShowNewProject(false);
      const list = await apiFetch("/projects");
      setProjects(list);
      selectProject(String(proj.id));
    } catch (err) {
      handleApiError(err);
    } finally {
      setCreatingProject(false);
    }
  }

  async function saveMemory(e) {
    e.preventDefault();
    if (!memoryContent.trim() || !projectId || savingMemory) return;
    setSavingMemory(true);

    // Build clean metadata object — omit empty values
    const metadata = Object.fromEntries(
      Object.entries(memoryMeta).filter(([, v]) => v.trim())
    );
    // Parse comma-separated tags
    const tags = memoryTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      await apiFetch(`/projects/${projectId}/memories`, {
        method: "POST",
        body: JSON.stringify({
          type: memoryType,
          source: memorySource,
          title: memoryTitle.trim() || null,
          content: memoryContent.trim(),
          metadata,
          tags,
        }),
      });
      toast.success("Memory saved.");
      setMemoryContent("");
      setMemoryTitle("");
      setMemoryTags("");
      setMemoryMeta({ url: "", file_path: "", language: "", model: "" });
      await loadMemories();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSavingMemory(false);
    }
  }

  async function runRecall(e) {
    e?.preventDefault();
    if (!projectId || recalling) return;
    setRecalling(true);
    setRecallItems([]);
    setMemoryPack("");
    try {
      const data = await apiFetch(
        `/projects/${projectId}/recall?query=${encodeURIComponent(recallQuery)}&limit=10`
      );
      setRecallItems(data.items || []);
      setMemoryPack(data.memory_pack_text || "");
      if (!(data.items?.length)) toast.info("No memories matched — showing recent instead.");
    } catch (err) {
      handleApiError(err);
    } finally {
      setRecalling(false);
    }
  }

  async function copyPack() {
    if (!memoryPack) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(memoryPack);
      } else {
        // HTTP fallback (execCommand)
        const ta = Object.assign(document.createElement("textarea"), {
          value: memoryPack,
          style: "position:fixed;left:-9999px;top:-9999px",
        });
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error();
      }
      toast.success("Memory pack copied to clipboard.");
    } catch {
      toast.error("Copy failed — use Download instead, or switch to HTTPS.");
    }
  }

  function downloadPack() {
    if (!memoryPack) return;
    const url = URL.createObjectURL(new Blob([memoryPack], { type: "text/plain;charset=utf-8" }));
    Object.assign(document.createElement("a"), {
      href: url, download: `memory-pack-${projectId}.txt`,
    }).click();
    URL.revokeObjectURL(url);
    toast.success("Memory pack downloaded.");
  }

  const currentProject  = projects.find((p) => String(p.id) === projectId);
  const filteredProjects = projects.filter((p) =>
    !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="app-layout">
        <aside className="sidebar">
          <Skeleton height="1rem" width="80px" style={{ marginBottom: 8 }} />
          {[1, 2, 3].map((i) => <Skeleton key={i} height="36px" radius="8px" />)}
        </aside>
        <div className="main-content">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    );
  }

  // ── App shell ─────────────────────────────────────────────────────────────
  return (
    <div className="app-layout">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="sidebar" aria-label="Projects">

        {/* Header row */}
        <div className="sidebar-header">
          <div className="row spread" style={{ paddingBottom: 6 }}>
            <span className="sidebar-section-label">
              Projects
              {projects.length > 0 && (
                <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 5 }}>
                  ({projects.length})
                </span>
              )}
            </span>
            <button
              className="btn ghost sm"
              onClick={() => setShowNewProject((v) => !v)}
              aria-label={showNewProject ? "Cancel" : "New project"}
              title="New project"
              style={{ padding: "2px 10px", fontSize: "1.1rem", lineHeight: 1 }}
            >
              {showNewProject ? "×" : "+"}
            </button>
          </div>

          {/* Create form */}
          {showNewProject && (
            <form onSubmit={createProject} className="stack-sm" style={{ paddingBottom: 8 }}>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                required
                maxLength={200}
                style={{ fontSize: "0.85rem", padding: "7px 10px" }}
                disabled={creatingProject}
              />
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="submit"
                  className="btn primary sm"
                  disabled={!newProjectName.trim() || creatingProject}
                  aria-busy={creatingProject}
                  style={{ flex: 1 }}
                >
                  {creatingProject ? <span className="spinner" /> : "Create"}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Search — only shown when there are enough projects */}
          {projects.length > 6 && (
            <div style={{ paddingBottom: 6 }}>
              <input
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Filter projects…"
                style={{ fontSize: "0.82rem", padding: "6px 10px" }}
                aria-label="Filter projects"
              />
            </div>
          )}
        </div>

        {/* Scrollable project list */}
        <div className="sidebar-projects">
          {projects.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.82rem", padding: "8px 4px" }}>
              No projects yet. Hit + to create one.
            </p>
          ) : filteredProjects.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.82rem", padding: "8px 4px" }}>
              No projects match &ldquo;{projectSearch}&rdquo;.
            </p>
          ) : (
            filteredProjects.map((p) => (
              <button
                key={p.id}
                className={`project-item${String(p.id) === projectId ? " active" : ""}`}
                onClick={() => selectProject(String(p.id))}
                title={p.name}
              >
                <span className="proj-dot" />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
                  {p.name}
                </span>
              </button>
            ))
          )}
        </div>

        {/* ── Usage meter ────────────────────────────────────────────────── */}
        {usage && <UsageMeter usage={usage} isUnlimited={auth?.is_unlimited} />}
      </aside>

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <main className="main-content">
        {!projectId ? (
          <div className="card">
            <div className="empty-state">
              <span className="empty-icon">📁</span>
              <h2 style={{ marginBottom: 6 }}>No project selected</h2>
              <p>Create your first project to start capturing memories.</p>
              <button className="btn primary sm" onClick={() => setShowNewProject(true)} style={{ marginTop: 8 }}>
                New project
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Project header */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="row spread">
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{currentProject?.name || "Project"}</h2>
                  <p className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                    {memories.length > 0
                      ? `${memories.length} memor${memories.length === 1 ? "y" : "ies"}`
                      : "No memories yet"}
                  </p>
                </div>
                <span className="badge badge-brand" style={{ fontFamily: "var(--display)", letterSpacing: "0.06em" }}>
                  Brain
                </span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" role="tablist">
              {[
                { id: "compose",  label: "Compose" },
                { id: "memories", label: `Memories${memories.length ? ` (${memories.length})` : ""}` },
                { id: "recall",   label: "Recall" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={`tab${tab === id ? " active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Compose ── */}
            {tab === "compose" && (
              <div className="card">
                <h2 style={{ marginBottom: 14, fontSize: "1rem" }}>Add a memory</h2>
                <form onSubmit={saveMemory} className="stack">

                  {/* Type chips */}
                  <div className="field">
                    <label>Memory type</label>
                    <div className="memory-type-grid" role="group" aria-label="Memory type">
                      {MEMORY_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`type-chip${memoryType === t ? " selected" : ""}`}
                          onClick={() => setMemoryType(t)}
                          aria-pressed={memoryType === t}
                          style={memoryType === t ? {
                            background: TYPE_COLORS[t]?.bg,
                            borderColor: TYPE_COLORS[t]?.color,
                            color: TYPE_COLORS[t]?.color,
                          } : {}}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Source + Title row */}
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label htmlFor="memory-source">Source</label>
                      <select
                        id="memory-source"
                        value={memorySource}
                        onChange={(e) => setMemorySource(e.target.value)}
                        disabled={savingMemory}
                      >
                        {MEMORY_SOURCES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label htmlFor="memory-title">Title <span className="muted">(optional)</span></label>
                      <input
                        id="memory-title"
                        type="text"
                        value={memoryTitle}
                        onChange={(e) => setMemoryTitle(e.target.value)}
                        placeholder="Short descriptive title"
                        disabled={savingMemory}
                        maxLength={500}
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="field">
                    <label htmlFor="memory-content">Content</label>
                    <textarea
                      id="memory-content"
                      value={memoryContent}
                      onChange={(e) => setMemoryContent(e.target.value)}
                      placeholder="What should future AI conversations remember about this project?"
                      required
                      disabled={savingMemory}
                      maxLength={10000}
                      style={{ minHeight: 120 }}
                    />
                    <span className="field-hint">
                      {memoryContent.length > 0 ? `${memoryContent.length.toLocaleString()} / 10,000` : "Up to 10,000 characters"}
                    </span>
                  </div>

                  {/* Tags */}
                  <div className="field">
                    <label htmlFor="memory-tags">Tags <span className="muted">(comma-separated)</span></label>
                    <input
                      id="memory-tags"
                      type="text"
                      value={memoryTags}
                      onChange={(e) => setMemoryTags(e.target.value)}
                      placeholder="e.g. auth, postgres, api-design"
                      disabled={savingMemory}
                    />
                    <span className="field-hint">Tags are shared across the project and clickable in search.</span>
                  </div>

                  {/* Advanced accordion */}
                  <details className="advanced-accordion">
                    <summary className="advanced-summary">Advanced metadata</summary>
                    <div className="stack-sm" style={{ paddingTop: 10 }}>
                      <div className="grid-2" style={{ gap: 12 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label htmlFor="meta-url">URL</label>
                          <input
                            id="meta-url"
                            type="url"
                            value={memoryMeta.url}
                            onChange={(e) => setMemoryMeta((m) => ({ ...m, url: e.target.value }))}
                            placeholder="https://…"
                            disabled={savingMemory}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label htmlFor="meta-file">File path</label>
                          <input
                            id="meta-file"
                            type="text"
                            value={memoryMeta.file_path}
                            onChange={(e) => setMemoryMeta((m) => ({ ...m, file_path: e.target.value }))}
                            placeholder="src/app/auth.py"
                            disabled={savingMemory}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label htmlFor="meta-lang">Language</label>
                          <input
                            id="meta-lang"
                            type="text"
                            value={memoryMeta.language}
                            onChange={(e) => setMemoryMeta((m) => ({ ...m, language: e.target.value }))}
                            placeholder="python, typescript…"
                            disabled={savingMemory}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label htmlFor="meta-model">Model / tool</label>
                          <input
                            id="meta-model"
                            type="text"
                            value={memoryMeta.model}
                            onChange={(e) => setMemoryMeta((m) => ({ ...m, model: e.target.value }))}
                            placeholder="gpt-4o, claude-3-5-sonnet…"
                            disabled={savingMemory}
                          />
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Actions */}
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={!memoryContent.trim() || savingMemory}
                      aria-busy={savingMemory}
                    >
                      {savingMemory && <span className="spinner" />}
                      {savingMemory ? "Saving…" : "Publish memory"}
                    </button>
                    {(memoryContent || memoryTitle || memoryTags) && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          setMemoryContent("");
                          setMemoryTitle("");
                          setMemoryTags("");
                          setMemoryMeta({ url: "", file_path: "", language: "", model: "" });
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* ── Memories ── */}
            {tab === "memories" && (
              <div className="card">
                <div className="row spread" style={{ marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>
                    All memories
                    {memories.length > 0 && (
                      <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                        {memories.length}
                      </span>
                    )}
                  </h2>
                  <button className="btn secondary sm" onClick={loadMemories} disabled={loadingMemories}>
                    {loadingMemories ? <span className="spinner" /> : "Refresh"}
                  </button>
                </div>

                {loadingMemories ? (
                  <div className="stack">
                    {[1, 2, 3].map((i) => <Skeleton key={i} height="64px" radius="8px" />)}
                  </div>
                ) : memories.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">💭</span>
                    <p>No memories yet. Go to Compose to add the first one.</p>
                    <button className="btn primary sm" onClick={() => setTab("compose")} style={{ marginTop: 8 }}>
                      Add memory
                    </button>
                  </div>
                ) : (
                  <div className="memory-list" role="list">
                    {memories.map((m) => (
                      <div key={m.id} className="memory-row" role="listitem" style={{ flexWrap: "wrap", gap: 8 }}>
                        <div className="row" style={{ gap: 6, flexShrink: 0, alignItems: "center" }}>
                          <TypeBadge type={m.type} />
                          {m.source && m.source !== "manual" && (
                            <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                              {m.source}
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {m.title && (
                            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--ink)", margin: "0 0 2px" }}>
                              {m.title}
                            </p>
                          )}
                          <span className="memory-row-content">{m.content}</span>
                          {m.tags?.length > 0 && (
                            <div className="row" style={{ gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                              {m.tags.map((tag) => (
                                <span key={tag} style={{
                                  fontSize: "0.68rem", color: "var(--brand)",
                                  background: "var(--brand-light)", border: "1px solid rgba(0,212,255,0.2)",
                                  borderRadius: 999, padding: "1px 7px", fontFamily: "var(--mono)",
                                }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="memory-row-time" title={new Date(m.created_at).toLocaleString()}>
                          {fmtTime(m.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Recall ── */}
            {tab === "recall" && (
              <div className="stack">
                <div className="card">
                  <h2 style={{ marginBottom: 12, fontSize: "1rem" }}>Recall context</h2>
                  <form onSubmit={runRecall} className="stack">
                    <div className="field">
                      <label htmlFor="recall-q">What do you need context on?</label>
                      <input
                        id="recall-q"
                        value={recallQuery}
                        onChange={(e) => setRecallQuery(e.target.value)}
                        placeholder="e.g. database migrations, auth model, performance…"
                        disabled={recalling}
                        autoComplete="off"
                      />
                      <span className="field-hint">Leave blank to get the most recent memories.</span>
                    </div>
                    <div className="row">
                      <button type="submit" className="btn primary" disabled={recalling} aria-busy={recalling}>
                        {recalling && <span className="spinner" />}
                        {recalling ? "Recalling…" : "Run recall"}
                      </button>
                      {recallQuery && (
                        <button type="button" className="btn ghost sm" onClick={() => setRecallQuery("")}>
                          Clear
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {(recallItems.length > 0 || memoryPack) && (
                  <div className="card">
                    <div className="row spread" style={{ marginBottom: 12 }}>
                      <h2 style={{ margin: 0, fontSize: "1rem" }}>
                        Results
                        {recallItems.length > 0 && (
                          <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                            {recallItems.length}
                          </span>
                        )}
                      </h2>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn secondary sm" onClick={copyPack} disabled={!memoryPack}>
                          Copy
                        </button>
                        <button className="btn secondary sm" onClick={downloadPack} disabled={!memoryPack}>
                          Download .txt
                        </button>
                      </div>
                    </div>

                    <div className="recall-result" style={{ marginBottom: 16 }}>
                      {recallItems.map((item) => (
                        <div key={item.id} className="recall-item">
                          <div className="recall-item-header">
                            <TypeBadge type={item.type} size="xs" />
                            {item.rank_score != null && (
                              <span className="recall-rank" title="FTS relevance score">
                                ★ {item.rank_score.toFixed(3)}
                              </span>
                            )}
                            <span className="memory-row-time" title={new Date(item.created_at).toLocaleString()}>
                              {fmtTime(item.created_at)}
                            </span>
                          </div>
                          <p style={{ fontSize: "0.88rem", color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
                            {item.content}
                          </p>
                        </div>
                      ))}
                    </div>

                    <label className="label" style={{ marginBottom: 6 }}>Memory pack (paste-ready)</label>
                    <pre className="pre">{memoryPack}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
