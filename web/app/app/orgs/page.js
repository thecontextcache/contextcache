"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../../components/toast";

export const dynamic = "force-dynamic";

function fmtDate(iso) {
  if (!iso) return "—";
  if (typeof window === "undefined") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

// ── Danger confirm modal ───────────────────────────────────────────────────────

function DangerModal({ title, body, confirmLabel = "Delete", onConfirm, onCancel, loading }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--bg-2)", border: "1px solid rgba(239,68,68,0.4)",
        borderRadius: 16, padding: 32, maxWidth: 420, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem", color: "#ef4444" }}>{title}</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 24px", lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="btn"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rename inline form ─────────────────────────────────────────────────────────

function RenameForm({ org, onSave, onCancel }) {
  const [name, setName] = useState(org.name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || name.trim() === org.name) { onCancel(); return; }
    setSaving(true);
    try { await onSave(name.trim()); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        disabled={saving}
        style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "0.9rem" }}
      />
      <button type="submit" className="btn primary sm" disabled={!name.trim() || saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn ghost sm" onClick={onCancel} disabled={saving}>Cancel</button>
    </form>
  );
}

// ── Org card ──────────────────────────────────────────────────────────────────

function OrgCard({ org, isCurrent, onRename, onDelete, onSwitch }) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div style={{
      background: "var(--bg-2)", border: `1px solid ${isCurrent ? "rgba(0,212,255,0.3)" : "var(--line-2)"}`,
      borderRadius: 12, padding: "16px 20px",
      boxShadow: isCurrent ? "0 0 0 1px rgba(0,212,255,0.1)" : "none",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <RenameForm
              org={org}
              onSave={async (name) => { await onRename(org.id, name); setRenaming(false); }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>
                {org.name}
              </span>
              {isCurrent && (
                <span style={{
                  fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                  borderRadius: 999, background: "rgba(0,212,255,0.12)",
                  color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Current
                </span>
              )}
            </div>
          )}
          {!renaming && (
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>
              ID: {org.id} · Created {fmtDate(org.created_at)}
            </div>
          )}
        </div>

        {!renaming && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {!isCurrent && (
              <button className="btn ghost sm" onClick={() => onSwitch(org)}>
                Switch
              </button>
            )}
            <button className="btn ghost sm" onClick={() => setRenaming(true)}>
              Rename
            </button>
            <button
              className="btn ghost sm"
              style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
              onClick={() => onDelete(org)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgsPage() {
  const router = useRouter();
  const toast = useToast();

  const [orgs, setOrgs] = useState([]);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/orgs");
      setOrgs(data ?? []);
      const stored = localStorage.getItem("CONTEXTCACHE_ORG_ID");
      setCurrentOrgId(stored ? Number(stored) : data?.[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.push("/auth");
      } else {
        toast.error("Could not load organisations.");
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await apiFetch("/orgs", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      toast.success(`Organisation "${newName.trim()}" created.`);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Failed to create organisation.");
    } finally {
      setCreating(false);
    }
  };

  // ── Rename ────────────────────────────────────────────────────────────────

  const handleRename = async (orgId, name) => {
    try {
      await apiFetch(`/orgs/${orgId}`, { method: "PATCH", body: JSON.stringify({ name }) });
      toast.success("Organisation renamed.");
      if (orgId === currentOrgId) {
        localStorage.setItem("CONTEXTCACHE_ORG_NAME", name);
        window.dispatchEvent(new Event("cc:org-changed"));
      }
      await load();
    } catch (e) {
      toast.error(e.message ?? "Failed to rename organisation.");
      throw e;
    }
  };

  // ── Switch ────────────────────────────────────────────────────────────────

  const handleSwitch = (org) => {
    localStorage.setItem("CONTEXTCACHE_ORG_ID", String(org.id));
    localStorage.setItem("CONTEXTCACHE_ORG_NAME", org.name);
    window.dispatchEvent(new Event("cc:org-changed"));
    setCurrentOrgId(org.id);
    toast.success(`Switched to "${org.name}".`);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/orgs/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`Organisation "${deleteTarget.name}" deleted.`);
      if (deleteTarget.id === currentOrgId) {
        localStorage.removeItem("CONTEXTCACHE_ORG_ID");
        localStorage.removeItem("CONTEXTCACHE_ORG_NAME");
        window.dispatchEvent(new Event("cc:org-changed"));
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Failed to delete organisation.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {deleteTarget && (
        <DangerModal
          title={`Delete "${deleteTarget.name}"?`}
          body={`This permanently deletes the organisation and all its API keys, memberships, and audit logs. Projects must be deleted first. This action cannot be undone.`}
          confirmLabel="Yes, delete it"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid var(--line)", padding: "20px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Organisation</h1>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
              {orgs.length} workspace{orgs.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>

          {/* Create new */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Create a New Organisation</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 16px" }}>
              Each organisation has its own projects, memories, and API keys.
            </p>
            <form onSubmit={handleCreate} style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={200}
                disabled={creating}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="btn primary"
                disabled={!newName.trim() || creating}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          </div>

          {/* Org list */}
          <div className="card">
            <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Your Organisations</h2>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0, 1].map((n) => (
                  <div key={n} style={{ height: 72, borderRadius: 10, background: "var(--panel-2)", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${n * 0.1}s` }} />
                ))}
              </div>
            ) : orgs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)", fontSize: "0.88rem" }}>
                No organisations yet. Create one above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {orgs.map((org) => (
                  <OrgCard
                    key={org.id}
                    org={org}
                    isCurrent={org.id === currentOrgId}
                    onRename={handleRename}
                    onDelete={setDeleteTarget}
                    onSwitch={handleSwitch}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Info box */}
          <div style={{
            marginTop: 24, padding: "16px 20px", borderRadius: 12,
            background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)",
            fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6,
          }}>
            <strong style={{ color: "var(--ink)" }}>Note:</strong> To delete an organisation, all its projects must be deleted first.
            You can do that from the Dashboard. Deleting an org also removes all its API keys and audit history.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
