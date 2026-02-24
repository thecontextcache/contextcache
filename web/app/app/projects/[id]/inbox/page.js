"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";

// ── Type config ───────────────────────────────────────────────────────────────

const TYPES = {
  decision:   { label: "Decision",   color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  finding:    { label: "Finding",    color: "#00D4FF", bg: "rgba(0,212,255,0.12)"   },
  definition: { label: "Definition", color: "#00E5A0", bg: "rgba(0,229,160,0.12)"   },
  todo:       { label: "Todo",       color: "#FB923C", bg: "rgba(251,146,60,0.12)"  },
  code:       { label: "Code",       color: "#38BDF8", bg: "rgba(56,189,248,0.12)"  },
  doc:        { label: "Doc",        color: "#34D399", bg: "rgba(52,211,153,0.12)"  },
  note:       { label: "Note",       color: "#94A3B8", bg: "rgba(148,163,184,0.1)"  },
  link:       { label: "Link",       color: "#F472B6", bg: "rgba(244,114,182,0.1)"  },
  chat:       { label: "Chat",       color: "#94A3B8", bg: "rgba(148,163,184,0.1)"  },
};

const ALL_TYPES = Object.keys(TYPES);

function typeMeta(t) {
  return TYPES[t] || TYPES.note;
}

// ── Confidence bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ score }) {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 80 ? "#00E5A0" : pct >= 50 ? "#FFB800" : "#FB7185";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 64, height: 4, borderRadius: 99, background: "var(--line)" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "0.7rem", fontWeight: 700, color, minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

// ── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const m = typeMeta(type);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 10px", borderRadius: 999,
      fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em",
      background: m.bg, color: m.color,
      border: `1px solid ${m.color}30`,
      textTransform: "uppercase",
    }}>
      {m.label}
    </span>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditModal({ item, onSave, onClose }) {
  const [type, setType] = useState(item.suggested_type || "note");
  const [title, setTitle] = useState(item.suggested_title || "");
  const [content, setContent] = useState(item.suggested_content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!content.trim()) { setError("Content cannot be empty."); return; }
    setSaving(true); setError("");
    try {
      await onSave({ suggested_type: type, suggested_title: title.trim() || null, suggested_content: content.trim() });
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--line)",
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 600,
        display: "flex", flexDirection: "column", gap: 18,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Edit before approving</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Type picker — visual pills */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ALL_TYPES.map((t) => {
              const m = typeMeta(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    padding: "4px 12px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600,
                    border: type === t ? `1.5px solid ${m.color}` : "1px solid var(--line)",
                    background: type === t ? m.bg : "transparent",
                    color: type === t ? m.color : "var(--muted)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Title (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title…"
            maxLength={500}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: "0.9rem" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Content</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            style={{
              padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)",
              background: "var(--bg)", color: "var(--ink)", fontSize: "0.88rem",
              resize: "vertical", fontFamily: "inherit", lineHeight: 1.65,
            }}
          />
        </label>

        {error && (
          <div style={{ color: "#ef4444", fontSize: "0.82rem", background: "rgba(239,68,68,0.08)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving} className="btn ghost">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="btn primary"
          >
            {saving ? "Saving…" : "Approve with edits"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draft card ─────────────────────────────────────────────────────────────────

function DraftCard({ item, onApprove, onReject, onEdit, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(null);
  const isLong = (item.suggested_content || "").length > 300;
  const preview = isLong && !expanded
    ? item.suggested_content.slice(0, 300) + "…"
    : item.suggested_content;

  async function act(action, fn) {
    setPending(action);
    try { await fn(item); } finally { setPending(null); }
  }

  return (
    <div style={{
      background: "var(--bg-2)", border: `1px solid ${selected ? "rgba(0,212,255,0.4)" : "var(--line-2)"}`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: selected ? "0 0 0 1px rgba(0,212,255,0.15)" : "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      {/* Colour accent strip */}
      <div style={{ height: 3, background: typeMeta(item.suggested_type).color, opacity: 0.7 }} />

      <div style={{ padding: "16px 20px" }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(item.id)}
            style={{ marginTop: 3, cursor: "pointer", accentColor: "#00D4FF", width: 15, height: 15, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <TypeBadge type={item.suggested_type} />
              <ConfidenceBar score={item.confidence_score} />
              <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--mono)", flexShrink: 0 }}>#{item.id}</span>
            </div>

            {/* Title */}
            {item.suggested_title && (
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)", marginBottom: 8, lineHeight: 1.4 }}>
                {item.suggested_title}
              </div>
            )}

            {/* Content */}
            <div style={{ fontSize: "0.875rem", color: "var(--ink-2)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {preview}
            </div>
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.78rem", marginTop: 4, padding: 0 }}
              >
                {expanded ? "▲ Show less" : "▼ Show more"}
              </button>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
          <button
            onClick={() => act("approve", onApprove)}
            disabled={!!pending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 16px", borderRadius: 8, border: "none",
              background: pending === "approve" ? "rgba(0,229,160,0.2)" : "#00E5A0",
              color: pending === "approve" ? "#00E5A0" : "#000",
              cursor: "pointer", fontSize: "0.82rem", fontWeight: 700,
              opacity: pending && pending !== "approve" ? 0.5 : 1,
            }}
          >
            {pending === "approve" ? "Saving…" : "✓ Approve"}
          </button>

          <button
            onClick={() => onEdit(item)}
            disabled={!!pending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid var(--line)", background: "transparent",
              color: "var(--ink)", cursor: "pointer", fontSize: "0.82rem",
              opacity: pending ? 0.5 : 1,
            }}
          >
            ✎ Edit
          </button>

          <button
            onClick={() => act("reject", onReject)}
            disabled={!!pending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.3)", background: "transparent",
              color: "#ef4444", cursor: "pointer", fontSize: "0.82rem",
              opacity: pending && pending !== "reject" ? 0.5 : 1,
            }}
          >
            {pending === "reject" ? "Rejecting…" : "✕ Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk bar ───────────────────────────────────────────────────────────────────

function BulkBar({ count, onApproveAll, onRejectAll, onClear, busy }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(0,212,255,0.06)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(0,212,255,0.2)", borderRadius: 12,
      padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
      flexWrap: "wrap", marginBottom: 16,
    }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#00D4FF", flex: 1 }}>
        {count} selected
      </span>
      <button
        onClick={onApproveAll}
        disabled={busy}
        style={{
          padding: "6px 16px", borderRadius: 8, border: "none",
          background: "#00E5A0", color: "#000", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
        }}
      >
        {busy === "approve" ? "Approving…" : `✓ Approve all (${count})`}
      </button>
      <button
        onClick={onRejectAll}
        disabled={busy}
        style={{
          padding: "6px 14px", borderRadius: 8,
          border: "1px solid rgba(239,68,68,0.3)", background: "transparent",
          color: "#ef4444", fontSize: "0.82rem", cursor: "pointer",
        }}
      >
        {busy === "reject" ? "Rejecting…" : `✕ Reject all (${count})`}
      </button>
      <button onClick={onClear} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem" }}>
        Clear
      </button>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ message, kind, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 2000,
      background: kind === "error" ? "#ef4444" : "#00E5A0",
      color: kind === "error" ? "#fff" : "#000",
      padding: "12px 20px", borderRadius: 10,
      fontSize: "0.85rem", fontWeight: 600,
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxWidth: 360,
      animation: "fadeUp 0.2s ease",
    }}>
      {message}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { id: projectId } = useParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [editingItem, setEditingItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(null);

  function showToast(msg, kind = "success") { setToast({ msg, kind }); }

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError(""); setSelected(new Set());
    try {
      const data = await apiFetch(`/projects/${projectId}/inbox?status=${statusFilter}&limit=100`);
      setItems(data.items || []);
    } catch (e) {
      setError(e.message || "Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Single actions ───────────────────────────────────────────────────────────

  async function handleApprove(item) {
    await apiFetch(`/inbox/${item.id}/approve`, { method: "POST" });
    setItems((p) => p.filter((i) => i.id !== item.id));
    setSelected((s) => { const n = new Set(s); n.delete(item.id); return n; });
    showToast("Memory saved ✓");
  }

  async function handleReject(item) {
    await apiFetch(`/inbox/${item.id}/reject`, { method: "POST" });
    setItems((p) => p.filter((i) => i.id !== item.id));
    setSelected((s) => { const n = new Set(s); n.delete(item.id); return n; });
    showToast("Draft rejected", "error");
  }

  async function handleEditSave(edits) {
    await apiFetch(`/inbox/${editingItem.id}/approve`, {
      method: "POST",
      body: JSON.stringify(edits),
    });
    setItems((p) => p.filter((i) => i.id !== editingItem.id));
    setEditingItem(null);
    showToast("Memory saved ✓");
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  async function bulkAct(action) {
    setBulkBusy(action);
    const ids = [...selected];
    const fn = action === "approve"
      ? (id) => apiFetch(`/inbox/${id}/approve`, { method: "POST" })
      : (id) => apiFetch(`/inbox/${id}/reject`, { method: "POST" });
    let done = 0;
    for (const id of ids) {
      try { await fn(id); done++; } catch { /* continue */ }
    }
    setItems((p) => p.filter((i) => !ids.includes(i.id)));
    setSelected(new Set());
    setBulkBusy(null);
    showToast(`${done} item${done !== 1 ? "s" : ""} ${action === "approve" ? "approved ✓" : "rejected"}`);
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)));
  }

  const pending = items.filter((i) => i.status === "pending");
  const pendingCount = pending.length;

  const FILTERS = [
    { id: "pending",  label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "all",      label: "All" },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 80px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ fontSize: "0.8rem", color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
          ← Dashboard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
              📥 Inbox
              {pendingCount > 0 && statusFilter === "pending" && (
                <span style={{
                  background: "var(--violet)", color: "#fff",
                  borderRadius: 999, fontSize: "0.75rem", fontWeight: 700,
                  padding: "2px 10px", lineHeight: 1.6,
                }}>
                  {pendingCount}
                </span>
              )}
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>
              AI-suggested memories for project #{projectId} — review and approve what to keep.
            </p>
          </div>

          <button className="btn ghost sm" onClick={load} title="Refresh">↻ Refresh</button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              style={{
                padding: "6px 16px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 600,
                border: statusFilter === id ? "none" : "1px solid var(--line)",
                background: statusFilter === id ? "var(--violet)" : "transparent",
                color: statusFilter === id ? "#fff" : "var(--muted)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}

          {/* Select-all shortcut — only in pending view */}
          {!loading && items.length > 0 && statusFilter === "pending" && (
            <button
              onClick={selected.size === items.length ? () => setSelected(new Set()) : selectAll}
              style={{
                marginLeft: "auto", padding: "6px 14px", borderRadius: 99,
                border: "1px solid var(--line)", background: "transparent",
                color: "var(--muted)", fontSize: "0.78rem", cursor: "pointer",
              }}
            >
              {selected.size === items.length ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onApproveAll={() => bulkAct("approve")}
          onRejectAll={() => bulkAct("reject")}
          onClear={() => setSelected(new Set())}
          busy={bulkBusy}
        />
      )}

      {/* Body */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2].map((n) => (
            <div key={n} style={{
              height: 160, borderRadius: 14,
              background: "var(--bg-2)", border: "1px solid var(--line)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${n * 0.15}s`,
            }} />
          ))}
        </div>
      ) : error ? (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 14, padding: "20px 24px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <span style={{ color: "#ef4444", fontSize: "0.88rem", flex: 1 }}>
            <strong>Error:</strong> {error}
          </span>
          <button onClick={load} className="btn ghost sm" style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "64px 24px",
          background: "var(--bg-2)", border: "1px solid var(--line)",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{statusFilter === "pending" ? "🎉" : "📭"}</div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 8 }}>
            {statusFilter === "pending" ? "Inbox Zero!" : `No ${statusFilter} items`}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 20 }}>
            {statusFilter === "pending"
              ? "No pending drafts. Send some data via POST /ingest/raw to get started."
              : `Switch to a different filter to see other items.`}
          </div>
          {statusFilter !== "pending" && (
            <button onClick={() => setStatusFilter("pending")} className="btn primary sm">
              View pending
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => (
            <DraftCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
              onEdit={setEditingItem}
              selected={selected.has(item.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onSave={handleEditSave}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.msg} kind={toast.kind} onDismiss={() => setToast(null)} />
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>
    </div>
  );
}
