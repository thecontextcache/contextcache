"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { SkeletonCard, Skeleton } from "../components/skeleton";

const MEMORY_TYPES = ["decision", "finding", "definition", "note", "link", "todo"];

const TYPE_COLORS = {
  decision:   { bg: "#ecfdf5", color: "#065f46" },
  finding:    { bg: "#eff6ff", color: "#1e40af" },
  definition: { bg: "#faf5ff", color: "#6b21a8" },
  note:       { bg: "#fefce8", color: "#854d0e" },
  link:       { bg: "#fff7ed", color: "#9a3412" },
  todo:       { bg: "#fdf2f8", color: "#831843" },
};

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

export default function AppPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState("compose"); // compose | memories | recall

  // Create project
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  // Memory composer
  const [memoryType, setMemoryType] = useState("decision");
  const [memoryContent, setMemoryContent] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  // Memories list
  const [memories, setMemories] = useState([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  // Recall
  const [recallQuery, setRecallQuery] = useState("");
  const [recallItems, setRecallItems] = useState([]);
  const [memoryPack, setMemoryPack] = useState("");
  const [recalling, setRecalling] = useState(false);

  function handleApiError(err) {
    if (err instanceof ApiError) {
      if (err.kind === "auth") { router.replace("/auth?reason=expired"); return; }
      if (err.kind === "forbidden") { toast.error("You don't have permission for this action."); return; }
      if (err.kind === "rate_limit") { toast.warn("Too many requests. Please wait a moment."); return; }
      if (err.kind === "network") { toast.error("Backend unreachable. Check server status."); return; }
    }
    toast.error(err.message || "Something went wrong.");
  }

  async function loadInitial() {
    setLoading(true);
    try {
      const me = await apiFetch("/auth/me");
      setAuth(me);
      const list = await apiFetch("/projects");
      setProjects(list);
      if (list.length) setProjectId(String(list[0].id));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInitial(); }, []);

  useEffect(() => {
    if (!projectId || tab !== "memories") return;
    loadMemories();
  }, [projectId, tab]);

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
      setProjectId(String(proj.id));
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
    try {
      await apiFetch(`/projects/${projectId}/memories`, {
        method: "POST",
        body: JSON.stringify({ type: memoryType, content: memoryContent.trim() }),
      });
      toast.success("Memory saved.");
      setMemoryContent("");
      if (tab === "memories") await loadMemories();
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
      if ((data.items || []).length === 0) {
        toast.info("No memories matched that query.");
      }
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
        toast.success("Memory pack copied to clipboard.");
        return;
      }
      // HTTP fallback
      const ta = document.createElement("textarea");
      ta.value = memoryPack;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) toast.success("Memory pack copied.");
      else throw new Error("copy failed");
    } catch {
      toast.error("Copy failed. Use the Download button, or switch to HTTPS.");
    }
  }

  function downloadPack() {
    if (!memoryPack) return;
    const blob = new Blob([memoryPack], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `memory-pack-${projectId}.txt`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Memory pack downloaded.");
  }

  const currentProject = projects.find((p) => String(p.id) === projectId);

  if (loading) {
    return (
      <div className="app-layout">
        <aside className="sidebar">
          <Skeleton height="1rem" width="80px" />
          {[1, 2, 3].map((i) => <Skeleton key={i} height="32px" radius="8px" />)}
        </aside>
        <div className="main-content">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Sidebar — project list */}
      <aside className="sidebar" aria-label="Projects">
        <div className="row spread" style={{ paddingBottom: 4 }}>
          <span className="sidebar-section-label">Projects</span>
          <button
            className="btn ghost sm"
            onClick={() => setShowNewProject((v) => !v)}
            aria-label={showNewProject ? "Cancel new project" : "New project"}
            title="New project"
            style={{ padding: "2px 8px", fontSize: "1rem", lineHeight: 1 }}
          >
            {showNewProject ? "×" : "+"}
          </button>
        </div>

        {showNewProject && (
          <form onSubmit={createProject} className="stack-sm" style={{ paddingBottom: 8 }}>
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              required
              style={{ fontSize: "0.85rem", padding: "7px 10px" }}
              disabled={creatingProject}
            />
            <button
              type="submit"
              className="btn primary sm"
              disabled={!newProjectName.trim() || creatingProject}
              aria-busy={creatingProject}
            >
              {creatingProject ? <span className="spinner" /> : "Create"}
            </button>
          </form>
        )}

        {projects.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.82rem", padding: "8px 4px" }}>
            No projects yet. Create one above.
          </p>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              className={`project-item${String(p.id) === projectId ? " active" : ""}`}
              onClick={() => setProjectId(String(p.id))}
              title={p.name}
            >
              <span className="proj-dot" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
            </button>
          ))
        )}

        <hr className="divider" style={{ margin: "8px 0" }} />

        <div className="row-wrap" style={{ paddingTop: 4 }}>
          {auth?.is_admin && (
            <Link href="/admin" className="btn ghost sm">Admin</Link>
          )}
          <button
            className="btn ghost sm"
            onClick={async () => {
              try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
              router.push("/auth");
            }}
          >
            Sign out
          </button>
        </div>

        {auth && (
          <p className="muted" style={{ fontSize: "0.75rem", paddingTop: 4 }}>
            {auth.email}
          </p>
        )}
      </aside>

      {/* Main panel */}
      <main>
        {!projectId ? (
          <div className="card">
            <div className="empty-state">
              <span className="empty-icon">📁</span>
              <p>Create or select a project to get started.</p>
              <button
                className="btn primary sm"
                onClick={() => setShowNewProject(true)}
              >
                New project
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="row spread">
                <div>
                  <h2 style={{ margin: 0 }}>{currentProject?.name || "Project"}</h2>
                  <p className="muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                    {memories.length > 0 ? `${memories.length} memories` : ""}
                  </p>
                </div>
                <div className="row">
                  <span className="badge badge-brand">Brain</span>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" role="tablist">
              {[
                { id: "compose",  label: "Compose" },
                { id: "memories", label: "Memories" },
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

            {/* Compose tab */}
            {tab === "compose" && (
              <div className="card">
                <h2 style={{ marginBottom: 14 }}>Add a memory</h2>
                <form onSubmit={saveMemory} className="stack">
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
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

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
                      {memoryContent.length > 0 && `${memoryContent.length} / 10,000 chars`}
                    </span>
                  </div>

                  <div className="row">
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={!memoryContent.trim() || savingMemory}
                      aria-busy={savingMemory}
                    >
                      {savingMemory && <span className="spinner" />}
                      {savingMemory ? "Saving…" : "Publish memory"}
                    </button>
                    {memoryContent && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setMemoryContent("")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* Memories tab */}
            {tab === "memories" && (
              <div className="card">
                <div className="row spread" style={{ marginBottom: 14 }}>
                  <h2 style={{ margin: 0 }}>Recent memories</h2>
                  <button className="btn secondary sm" onClick={loadMemories} disabled={loadingMemories}>
                    Refresh
                  </button>
                </div>

                {loadingMemories ? (
                  <div className="stack">
                    {[1, 2, 3].map((i) => <Skeleton key={i} height="64px" radius="8px" />)}
                  </div>
                ) : memories.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">💭</span>
                    <p>No memories yet. Switch to Compose to add the first one.</p>
                    <button className="btn primary sm" onClick={() => setTab("compose")}>
                      Add memory
                    </button>
                  </div>
                ) : (
                  <div className="memory-list" role="list">
                    {memories.map((m) => {
                      const style = TYPE_COLORS[m.type] || {};
                      return (
                        <div key={m.id} className="memory-row" role="listitem">
                          <span
                            className="memory-row-type"
                            style={{ color: style.color, backgroundColor: style.bg, padding: "2px 6px", borderRadius: 4 }}
                          >
                            {m.type}
                          </span>
                          <span className="memory-row-content">{m.content}</span>
                          <span className="memory-row-time">{fmtTime(m.created_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Recall tab */}
            {tab === "recall" && (
              <div className="stack">
                <div className="card">
                  <h2 style={{ marginBottom: 12 }}>Recall context</h2>
                  <form onSubmit={runRecall} className="stack">
                    <div className="field">
                      <label htmlFor="recall-q">What do you need context on?</label>
                      <input
                        id="recall-q"
                        value={recallQuery}
                        onChange={(e) => setRecallQuery(e.target.value)}
                        placeholder="e.g. database migrations, auth model, performance issues…"
                        disabled={recalling}
                      />
                      <span className="field-hint">
                        Leave blank to get the most recent memories.
                      </span>
                    </div>
                    <div className="row">
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={recalling}
                        aria-busy={recalling}
                      >
                        {recalling && <span className="spinner" />}
                        {recalling ? "Recalling…" : "Run recall"}
                      </button>
                    </div>
                  </form>
                </div>

                {(recallItems.length > 0 || memoryPack) && (
                  <div className="card">
                    <div className="row spread" style={{ marginBottom: 12 }}>
                      <h2 style={{ margin: 0 }}>
                        Results
                        {recallItems.length > 0 && (
                          <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                            {recallItems.length}
                          </span>
                        )}
                      </h2>
                      <div className="row">
                        <button
                          className="btn secondary sm"
                          onClick={copyPack}
                          disabled={!memoryPack}
                          title="Copy memory pack"
                        >
                          Copy
                        </button>
                        <button
                          className="btn secondary sm"
                          onClick={downloadPack}
                          disabled={!memoryPack}
                          title="Download as .txt"
                        >
                          Download .txt
                        </button>
                      </div>
                    </div>

                    {/* Ranked result list */}
                    <div className="recall-result" style={{ marginBottom: 16 }}>
                      {recallItems.map((item) => {
                        const style = TYPE_COLORS[item.type] || {};
                        return (
                          <div key={item.id} className="recall-item">
                            <div className="recall-item-header">
                              <span
                                className="memory-row-type"
                                style={{ color: style.color, backgroundColor: style.bg, padding: "2px 6px", borderRadius: 4, fontSize: "0.72rem" }}
                              >
                                {item.type}
                              </span>
                              {item.rank_score != null && (
                                <span className="recall-rank" title="FTS relevance score">
                                  ★ {item.rank_score.toFixed(3)}
                                </span>
                              )}
                              <span className="memory-row-time">{fmtTime(item.created_at)}</span>
                            </div>
                            <p style={{ fontSize: "0.88rem", color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
                              {item.content}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Memory pack */}
                    <label className="label" style={{ marginBottom: 6 }}>Memory pack (paste-ready)</label>
                    <pre className="pre">{memoryPack || "Memory pack will appear here."}</pre>
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
