"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { SkeletonCard, Skeleton } from "../components/skeleton";
import { motion, AnimatePresence } from "framer-motion";

const MEMORY_TYPES = ["decision", "finding", "definition", "note", "link", "todo", "chat", "doc", "code"];
const MEMORY_SOURCES = ["manual", "chatgpt", "claude", "cursor", "codex", "api"];

export const dynamic = "force-dynamic";

// Dark-mode-aware type colors using the design system palette
const TYPE_COLORS = {
  decision: { color: "#00D4FF", bg: "rgba(0,212,255,0.12)" },
  finding: { color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  definition: { color: "#00E5A0", bg: "rgba(0,229,160,0.12)" },
  note: { color: "#FFB800", bg: "rgba(255,184,0,0.12)" },
  link: { color: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
  todo: { color: "#F472B6", bg: "rgba(244,114,182,0.12)" },
};

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
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

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 30 } }
};

// ── Usage meter ─────────────────────────────────────────────────────────────

function UsageMeter({ usage, isUnlimited }) {
  const lim = usage?.limits ?? {};
  const rows = [
    { label: "memories", used: usage?.memories_created ?? 0, max: lim.memories_per_day ?? 0, color: "#00D4FF" },
    { label: "recalls", used: usage?.recall_queries ?? 0, max: lim.recalls_per_day ?? 0, color: "#A78BFA" },
    { label: "projects", used: usage?.projects_created ?? 0, max: lim.projects_per_day ?? 0, color: "#00E5A0" },
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
          const fill = full ? "#ef4444" : near ? "#f59e0b" : "#00D4FF";
          const tip = isUnlimited
            ? `${label}: ${used} / unlimited`
            : max > 0
              ? `${label}: ${used} / ${max}`
              : `${label}: ${used} (no configured limit)`;
          return (
            <div key={label} title={tip}>
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
                    background: fill,
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
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(null);
  const [usage, setUsage] = useState(null);
  const [projects, setProjects] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState("compose");
  const [projectSearch, setProjectSearch] = useState("");

  // Create project
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  // Create Organization
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [showNewOrg, setShowNewOrg] = useState(false);

  // Memory composer
  const [memoryType, setMemoryType] = useState("decision");
  const [memorySource, setMemorySource] = useState("manual");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryTags, setMemoryTags] = useState("");
  const [memoryMeta, setMemoryMeta] = useState({ url: "", file_path: "", language: "", model: "" });
  const [savingMemory, setSavingMemory] = useState(false);

  // Memories list
  const [memories, setMemories] = useState([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  // Recall
  const [recallQuery, setRecallQuery] = useState("");
  const [recallItems, setRecallItems] = useState([]);
  const [memoryPack, setMemoryPack] = useState("");
  const [recalling, setRecalling] = useState(false);
  const [recallFormat, setRecallFormat] = useState("text"); // "text" | "toon"

  // API Keys
  const [apiKeys, setApiKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newKeyName, setNewKeyName] = useState("");

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
      const orgRows = await apiFetch("/me/orgs");
      setOrgs(orgRows || []);
      const storedOrgId = typeof window !== "undefined"
        ? (window.localStorage.getItem("CONTEXTCACHE_ORG_ID") || "").trim()
        : "";
      const hasStored = (orgRows || []).some((o) => String(o.id) === storedOrgId);
      const nextOrgId = hasStored
        ? storedOrgId
        : (orgRows?.[0]?.id ? String(orgRows[0].id) : "");
      if (typeof window !== "undefined") {
        if (nextOrgId) {
          window.localStorage.setItem("CONTEXTCACHE_ORG_ID", nextOrgId);
          const orgRow = (orgRows || []).find((o) => String(o.id) === nextOrgId);
          if (orgRow) {
            window.localStorage.setItem("CONTEXTCACHE_ORG_NAME", orgRow.name);
            window.dispatchEvent(new Event("cc:org-changed"));
          }
        } else {
          window.localStorage.removeItem("CONTEXTCACHE_ORG_ID");
          window.localStorage.removeItem("CONTEXTCACHE_ORG_NAME");
        }
      }
      setOrgId(nextOrgId);
      setAuth(me);
      if (!nextOrgId) {
        setProjects([]);
        setProjectId("");
        setUsage(await apiFetch("/me/usage").catch(() => null));
        toast.warn("No organization membership found. Ask an admin to add you to an org.");
        return;
      }
      const [list, usageRes] = await Promise.all([
        apiFetch("/projects"),
        apiFetch("/me/usage").catch(() => null), // non-fatal
      ]);
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

  async function switchOrg(nextOrgId) {
    if (!nextOrgId || nextOrgId === orgId) return;
    const previousOrgId = orgId;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("CONTEXTCACHE_ORG_ID", nextOrgId);
    }
    setOrgId(nextOrgId);
    setProjectId("");
    setProjects([]);
    setMemories([]);
    setRecallItems([]);
    setMemoryPack("");
    setRecallQuery("");
    setTab("compose");
    try {
      const [list, usageRes] = await Promise.all([
        apiFetch("/projects"),
        apiFetch("/me/usage").catch(() => null),
      ]);
      setProjects(list);
      if (list.length) setProjectId(String(list[0].id));
      if (usageRes) setUsage(usageRes);
      toast.success("Switched organization.");
    } catch (err) {
      if (typeof window !== "undefined") {
        if (previousOrgId) {
          window.localStorage.setItem("CONTEXTCACHE_ORG_ID", previousOrgId);
        } else {
          window.localStorage.removeItem("CONTEXTCACHE_ORG_ID");
        }
      }
      setOrgId(previousOrgId);
      handleApiError(err);
    }
  }

  // Load memories whenever project or tab changes
  useEffect(() => {
    if (!projectId) return;
    loadMemories();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || tab !== "memories") return;
    loadMemories();
  }, [tab]);

  useEffect(() => {
    if (!orgId || tab !== "api") return;
    loadApiKeys();
  }, [tab, orgId]);

  async function loadApiKeys() {
    setLoadingKeys(true);
    try {
      const keys = await apiFetch(`/orgs/${orgId}/api-keys`);
      setApiKeys(keys);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoadingKeys(false);
    }
  }

  async function generateApiKey(e) {
    e.preventDefault();
    if (!orgId || generatingKey || !newKeyName.trim()) return;
    setGeneratingKey(true);
    setNewKey("");
    try {
      const res = await apiFetch(`/orgs/${orgId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: newKeyName.trim(), expires_in_days: 90 })
      });
      setNewKey(res.api_key);
      setNewKeyName("");
      toast.success("API key generated successfully.");
      await loadApiKeys();
    } catch (err) {
      handleApiError(err);
    } finally {
      setGeneratingKey(false);
    }
  }

  async function revokeApiKey(keyId) {
    if (!confirm("Are you sure you want to revoke this key? Any AI agents using it will be instantly disconnected.")) return;
    try {
      await apiFetch(`/orgs/${orgId}/api-keys/${keyId}/revoke`, { method: "POST" });
      toast.success("API key revoked.");
      await loadApiKeys();
    } catch (err) {
      handleApiError(err);
    }
  }

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

  async function createOrg(e) {
    e.preventDefault();
    if (!newOrgName.trim() || creatingOrg) return;
    setCreatingOrg(true);
    try {
      const resp = await apiFetch("/orgs", {
        method: "POST",
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      toast.success(`Organization "${resp.name}" created.`);
      setNewOrgName("");
      setShowNewOrg(false);

      const newOrgs = await apiFetch("/me/orgs");
      setOrgs(newOrgs || []);

      // Select the new org
      switchOrg(String(resp.id));
    } catch (err) {
      handleApiError(err);
    } finally {
      setCreatingOrg(false);
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

  async function runRecall(e, fmt) {
    e?.preventDefault();
    if (!projectId || recalling) return;
    const activeFormat = fmt || recallFormat || "text";
    setRecalling(true);
    setRecallItems([]);
    setMemoryPack("");
    try {
      const data = await apiFetch(
        `/projects/${projectId}/recall?query=${encodeURIComponent(recallQuery)}&limit=10&format=${activeFormat}`
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

  const currentProject = projects.find((p) => String(p.id) === projectId);
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
          <div style={{ paddingBottom: 8 }}>
            <label htmlFor="org-switch" style={{ fontSize: "0.72rem", marginBottom: 4, color: "var(--muted)" }}>
              Organization Scope
            </label>
            <select
              id="org-switch"
              value={orgId}
              onChange={(e) => switchOrg(e.target.value)}
              style={{ fontSize: "0.82rem", padding: "6px 10px" }}
              disabled={orgs.length === 0}
            >
              {orgs.length === 0 ? (
                <option value="">No organizations available</option>
              ) : (
                orgs.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))
              )}
            </select>
            <div className="muted row spread" style={{ fontSize: "0.7rem", marginTop: 5 }}>
              <span>
                {orgs.length > 1
                  ? "Switch org to view its projects and memories."
                  : "Project list is scoped to this organization."}
              </span>
              <button
                className="btn text xs"
                style={{ padding: 0 }}
                onClick={() => setShowNewOrg((v) => !v)}
              >
                {showNewOrg ? "Cancel" : "+ New Org"}
              </button>
            </div>
          </div>

          {/* Create Org Form */}
          {showNewOrg && (
            <form onSubmit={createOrg} className="stack-sm" style={{ paddingBottom: 16 }}>
              <input
                autoFocus
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Organization Name"
                required
                maxLength={200}
                style={{ fontSize: "0.85rem", padding: "7px 10px" }}
                disabled={creatingOrg}
              />
              <button
                type="submit"
                className="btn primary sm"
                disabled={!newOrgName.trim() || creatingOrg}
                aria-busy={creatingOrg}
                style={{ width: "100%" }}
              >
                {creatingOrg ? <span className="spinner" /> : "Create Organization"}
              </button>
            </form>
          )}

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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link
                    href={`/app/projects/${projectId}/inbox`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 12px", borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface-1)", color: "var(--text)",
                      fontSize: 12, fontWeight: 600, textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                    title="Review AI-suggested memory drafts"
                  >
                    📥 Inbox
                  </Link>
                  <span className="badge badge-brand" style={{ fontFamily: "var(--display)", letterSpacing: "0.06em" }}>
                    Brain
                  </span>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" role="tablist">
              {[
                { id: "compose", label: "Compose" },
                { id: "memories", label: `Memories${memories.length ? ` (${memories.length})` : ""}` },
                { id: "recall", label: "Recall" },
                { id: "api", label: "Integrations & API" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={`tab${tab === id ? " active" : ""}`}
                  onClick={() => setTab(id)}
                  style={{ position: 'relative' }}
                >
                  {label}
                  {tab === id && (
                    <motion.div
                      layoutId="activeAppTabIndicator"
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        left: 0,
                        right: 0,
                        height: 2,
                        backgroundColor: 'var(--brand)',
                        borderRadius: '2px 2px 0 0'
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* ── Compose ── */}
              {tab === "compose" && (
                <motion.div key="compose" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                  <form onSubmit={saveMemory} className="stack card" style={{ padding: 32, background: "rgba(14, 18, 30, 0.4)", backdropFilter: "blur(40px)", borderColor: "rgba(0,229,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>

                    <div className="row spread" style={{ marginBottom: 16 }}>
                      <h2 style={{ fontSize: "1.1rem", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="brand-logo" style={{ width: 16, height: 16 }}>⌘</span>
                        New Memory
                      </h2>
                      {/* Type chips merged into header row */}
                      <div className="memory-type-grid" role="group" aria-label="Memory type" style={{ display: "flex", gap: 6 }}>
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
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                              borderRadius: 999
                            } : { padding: "4px 10px", fontSize: "0.75rem", borderRadius: 999 }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field">
                      <textarea
                        id="memory-content"
                        value={memoryContent}
                        onChange={(e) => setMemoryContent(e.target.value)}
                        placeholder="What should future AI conversations remember about this project?"
                        required
                        disabled={savingMemory}
                        maxLength={10000}
                        style={{ minHeight: 140, fontSize: "1.05rem", background: "rgba(5,7,12,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}
                      />
                    </div>

                    <div className="grid-2" style={{ gap: 16, marginTop: 8 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <input
                          id="memory-title"
                          type="text"
                          value={memoryTitle}
                          onChange={(e) => setMemoryTitle(e.target.value)}
                          placeholder="Short title (optional)"
                          disabled={savingMemory}
                          maxLength={500}
                          style={{ background: "rgba(5,7,12,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <input
                          id="memory-tags"
                          type="text"
                          value={memoryTags}
                          onChange={(e) => setMemoryTags(e.target.value)}
                          placeholder="Tags (comma-separated)"
                          disabled={savingMemory}
                          style={{ background: "rgba(5,7,12,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}
                        />
                      </div>
                    </div>

                    {/* Advanced accordion */}
                    <details className="advanced-accordion" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.05)", marginTop: 8 }}>
                      <summary className="advanced-summary" style={{ padding: "12px 16px" }}>Advanced metadata (URLs, Files)</summary>
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
                </motion.div>
              )}

              {/* ── Memories ── */}
              {tab === "memories" && (
                <motion.div key="memories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="card">
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
                    <motion.div
                      className="memory-list stack-sm"
                      role="list"
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                    >
                      {memories.map((m) => (
                        <motion.div
                          key={m.id}
                          variants={itemVariants}
                          className="memory-row card"
                          role="listitem"
                          style={{
                            display: "flex", flexWrap: "wrap", gap: 12, padding: "16px 20px",
                            background: "rgba(20, 26, 43, 0.4)", border: "1px solid rgba(0, 229, 255, 0.05)"
                          }}
                        >
                          <div className="row" style={{ gap: 8, flexShrink: 0, alignItems: "flex-start", marginTop: 2 }}>
                            <TypeBadge type={m.type} />
                            {m.source && m.source !== "manual" && (
                              <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>
                                {m.source}
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {m.title && (
                              <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--ink)", margin: "0 0 6px", letterSpacing: "0.01em" }}>
                                {m.title}
                              </p>
                            )}
                            <span className="memory-row-content" style={{ color: "var(--ink-2)", fontSize: "0.88rem", lineHeight: 1.6 }}>
                              {m.content}
                            </span>
                            {m.tags?.length > 0 && (
                              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                                {m.tags.map((tag) => (
                                  <span key={tag} style={{
                                    fontSize: "0.7rem", color: "var(--brand)",
                                    background: "var(--brand-light)", border: "1px solid rgba(0,229,255,0.15)",
                                    borderRadius: 999, padding: "2px 10px", fontFamily: "var(--mono)",
                                  }}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="memory-row-time" title={new Date(m.created_at).toLocaleString()} style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                            {fmtTime(m.created_at)}
                          </span>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ── Recall ── */}
              {tab === "recall" && (
                <motion.div key="recall" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="stack">
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
                      {/* Format toggle */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Output format
                        </span>
                        {[
                          { id: "text", label: "Text", title: "Human-readable grouped format" },
                          { id: "toon", label: "TOON", title: "Token-Oriented Object Notation — compact format for AI agents" },
                        ].map((fmt) => (
                          <button
                            key={fmt.id}
                            type="button"
                            title={fmt.title}
                            onClick={() => setRecallFormat(fmt.id)}
                            style={{
                              padding: "4px 12px", borderRadius: 7, border: "none",
                              background: recallFormat === fmt.id ? "var(--violet)" : "var(--surface-1)",
                              color: recallFormat === fmt.id ? "#fff" : "var(--muted)",
                              border: recallFormat === fmt.id ? "none" : "1px solid var(--border)",
                              cursor: "pointer", fontSize: 12, fontWeight: 600,
                            }}
                          >
                            {fmt.label}
                          </button>
                        ))}
                        {recallFormat === "toon" && (
                          <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
                            ~40% fewer tokens — ideal for agents
                          </span>
                        )}
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
                </motion.div>
              )}

              {/* ── Integrations & API Keys ── */}
              {tab === "api" && (
                <motion.div key="api" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="stack">
                  <div className="card">
                    <h2 style={{ marginBottom: 8, fontSize: "1.1rem", display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="badge badge-brand">New</span> AI Agent Integrations
                    </h2>
                    <p style={{ fontSize: "0.85rem", color: "var(--ink-2)", marginBottom: 16 }}>
                      Connect thecontextcache™ directly to ChatGPT, Claude Desktop, and local IDEs like Cursor or VS Code.
                    </p>

                    <div className="grid-2" style={{ gap: 16, marginBottom: 24 }}>
                      <div className="card-sm" style={{ background: "var(--panel-2)", border: "1px solid var(--line)", padding: 16 }}>
                        <h3 style={{ color: "var(--brand)", marginBottom: 4 }}>🧠 ChatGPT Custom GPTs</h3>
                        <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 12px" }}>
                          Add the OpenAPI schema as an Action so ChatGPT can Recall project context mid-conversation.
                        </p>
                        <a href={`${apiBase}/openapi.json`} target="_blank" className="btn secondary sm" style={{ width: "100%" }}>
                          View OpenAPI Schema ↗
                        </a>
                      </div>
                      <div className="card-sm" style={{ background: "var(--panel-2)", border: "1px solid var(--line)", padding: 16 }}>
                        <h3 style={{ color: "var(--violet)", marginBottom: 4 }}>🤖 Claude MCP Server</h3>
                        <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 12px" }}>
                          Connect Claude Desktop using the Model Context Protocol to dynamically pull architecture docs.
                        </p>
                        <button className="btn secondary sm" style={{ width: "100%" }} onClick={() => toast.info("MCP plugin coming soon.")}>
                          View Setup Guide →
                        </button>
                      </div>
                    </div>

                    <hr className="divider" style={{ margin: "24px 0" }} />

                    <h2 style={{ marginBottom: 12, fontSize: "1rem" }}>API Keys</h2>
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16 }}>
                      Generate a Personal Access Token to authenticate external agents as yourself. Keep these secret.
                    </p>

                    <form onSubmit={generateApiKey} className="row" style={{ gap: 8, marginBottom: 24 }}>
                      <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                        <input
                          type="text"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="e.g. ChatGPT Personal Key"
                          disabled={generatingKey}
                          maxLength={100}
                        />
                      </div>
                      <button type="submit" className="btn primary" disabled={!newKeyName.trim() || generatingKey} aria-busy={generatingKey}>
                        {generatingKey ? <span className="spinner" /> : "Generate Key"}
                      </button>
                    </form>

                    {newKey && (
                      <div className="alert ok" style={{ marginBottom: 24, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <strong>Save this key now!</strong>
                        <p style={{ fontSize: "0.82rem", color: "var(--ink)" }}>It will not be shown again. Use it as a Bearer token in the `X-Api-Key` or `Authorization` header.</p>
                        <div className="row">
                          <code style={{ flex: 1, padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--ok-light)", userSelect: "all", wordBreak: "break-all" }}>
                            {newKey}
                          </code>
                        </div>
                      </div>
                    )}

                    <div className="stack-sm">
                      <label className="label">Active Keys for {currentProject?.name || "this org"}</label>
                      {loadingKeys ? (
                        <Skeleton height={40} />
                      ) : apiKeys.length === 0 ? (
                        <p className="muted" style={{ fontSize: "0.85rem" }}>No active API keys found.</p>
                      ) : (
                        apiKeys.map((key) => (
                          <div key={key.id} className="row spread card-sm" style={{ background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
                            <div>
                              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)" }}>{key.name || "Unnamed Key"}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
                                {key.prefix}... • Expires {new Date(key.expires_at).toLocaleDateString()}
                              </div>
                            </div>
                            <button className="btn ghost sm" onClick={() => revokeApiKey(key.id)} style={{ color: "var(--danger)" }}>
                              Revoke
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
