"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";

// ─── Type badge colours (mirrors the main app) ───────────────────────────────
const TYPE_COLORS = {
  decision:   { bg: "var(--violet-soft)",  text: "var(--violet)",  label: "Decision"   },
  finding:    { bg: "var(--blue-soft)",    text: "var(--blue)",    label: "Finding"    },
  definition: { bg: "var(--green-soft)",   text: "var(--green)",   label: "Definition" },
  todo:       { bg: "var(--orange-soft)",  text: "var(--orange)",  label: "Todo"       },
  code:       { bg: "var(--cyan-soft)",    text: "var(--cyan)",    label: "Code"       },
  doc:        { bg: "var(--teal-soft)",    text: "var(--teal)",    label: "Doc"        },
  note:       { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "Note"       },
  link:       { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "Link"       },
  chat:       { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "Chat"       },
  event:      { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "Event"      },
  file:       { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "File"       },
  web:        { bg: "var(--muted-bg)",     text: "var(--muted)",   label: "Web"        },
};
const MEMORY_TYPES = Object.keys(TYPE_COLORS);

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || TYPE_COLORS.note;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        background: color.bg,
        color: color.text,
        border: `1px solid ${color.text}22`,
        textTransform: "uppercase",
      }}
    >
      {color.label}
    </span>
  );
}

function ConfidencePip({ score }) {
  const pct = Math.round((score || 0) * 100);
  const hue = Math.round(pct * 1.2); // 0→red, 100→green
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: `hsl(${hue},65%,45%)`,
      }}
    >
      {pct}% confidence
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ item, onSave, onClose }) {
  const [type, setType] = useState(item.suggested_type || "note");
  const [title, setTitle] = useState(item.suggested_title || "");
  const [content, setContent] = useState(item.suggested_content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ suggested_type: type, suggested_title: title.trim() || null, suggested_content: content.trim() });
    } catch (e) {
      setError(e.message || "Failed to approve item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Edit before approving</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Type selector */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              color: "var(--text)",
              fontSize: 14,
            }}
          >
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_COLORS[t]?.label || t}</option>
            ))}
          </select>
        </label>

        {/* Title */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Title (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title…"
            maxLength={500}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              color: "var(--text)",
              fontSize: 14,
            }}
          />
        </label>

        {/* Content */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Content</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              color: "var(--text)",
              fontSize: 14,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </label>

        {error && (
          <div style={{ color: "var(--red)", fontSize: 13, background: "var(--red-soft)", padding: "8px 12px", borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-1)", color: "var(--text)", cursor: "pointer", fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "var(--green)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : "✅ Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Draft Card ───────────────────────────────────────────────────────────────

function DraftCard({ item, onApprove, onReject, onEdit }) {
  const [actionPending, setActionPending] = useState(null); // "approve" | "reject"

  async function handleApprove() {
    setActionPending("approve");
    try { await onApprove(item); } finally { setActionPending(null); }
  }

  async function handleReject() {
    setActionPending("reject");
    try { await onReject(item); } finally { setActionPending(null); }
  }

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TypeBadge type={item.suggested_type} />
        <ConfidencePip score={item.confidence_score} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
          #{item.id}
        </span>
      </div>

      {/* Title */}
      {item.suggested_title && (
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
          {item.suggested_title}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          fontSize: 13,
          color: "var(--text-2)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 180,
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
        }}
      >
        {item.suggested_content}
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={handleApprove}
          disabled={!!actionPending}
          title="Approve and promote to memory"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: actionPending === "approve" ? "var(--green-soft)" : "var(--green)",
            color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
            opacity: actionPending ? 0.7 : 1,
          }}
        >
          {actionPending === "approve" ? "Saving…" : "✅ Approve"}
        </button>

        <button
          onClick={() => onEdit(item)}
          disabled={!!actionPending}
          title="Edit before approving"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-1)", color: "var(--text)",
            cursor: "pointer", fontSize: 13,
            opacity: actionPending ? 0.7 : 1,
          }}
        >
          ✏️ Edit
        </button>

        <button
          onClick={handleReject}
          disabled={!!actionPending}
          title="Reject this draft"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8,
            border: "1px solid var(--red-border, var(--border))",
            background: "var(--surface-1)", color: "var(--red, #e53)",
            cursor: "pointer", fontSize: 13,
            opacity: actionPending ? 0.7 : 1,
          }}
        >
          {actionPending === "reject" ? "Rejecting…" : "❌ Reject"}
        </button>
      </div>
    </div>
  );
}

// ─── Toast (simple inline) ────────────────────────────────────────────────────

function Toast({ message, kind = "success", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 2000,
        background: kind === "error" ? "var(--red)" : "var(--green)",
        color: "#fff", padding: "12px 20px", borderRadius: 10,
        fontSize: 13, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        maxWidth: 360,
        animation: "fadeInUp 0.2s ease",
      }}
    >
      {message}
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function InboxPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [editingItem, setEditingItem] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, kind = "success") {
    setToast({ message, kind });
  }

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(
        `/projects/${projectId}/inbox?status=${statusFilter}&limit=100`
      );
      setItems(data.items || []);
    } catch (e) {
      setError(e.message || "Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Approve (direct, no edit) ────────────────────────────────────────────
  async function handleApprove(item) {
    await apiFetch(`/inbox/${item.id}/approve`, { method: "POST" });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    showToast("Memory saved! ✅");
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  async function handleReject(item) {
    await apiFetch(`/inbox/${item.id}/reject`, { method: "POST" });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    showToast("Draft rejected.", "error");
  }

  // ── Edit → Approve ───────────────────────────────────────────────────────
  async function handleEditSave(edits) {
    await apiFetch(`/inbox/${editingItem.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edits),
    });
    setItems((prev) => prev.filter((i) => i.id !== editingItem.id));
    setEditingItem(null);
    showToast("Memory saved! ✅");
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: "32px 16px 80px" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Link
              href="/app"
              style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}
            >
              ← Back to projects
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", gap: 12 }}>
            Inbox
            {pendingCount > 0 && statusFilter === "pending" && (
              <span
                style={{
                  background: "var(--violet)",
                  color: "#fff",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 10px",
                  lineHeight: 1.6,
                }}
              >
                {pendingCount}
              </span>
            )}
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Review and approve AI-suggested memory drafts for project #{projectId}.
          </p>
        </div>

        {/* Status filter tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: statusFilter === s ? "none" : "1px solid var(--border)",
                background: statusFilter === s ? "var(--violet)" : "var(--surface-1)",
                color: statusFilter === s ? "#fff" : "var(--text)",
                cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              style={{
                height: 140, borderRadius: 12,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${n * 0.15}s`,
              }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          style={{
            background: "var(--red-soft)", border: "1px solid var(--red-border, var(--border))",
            borderRadius: 12, padding: "20px 24px", color: "var(--red, #e53)", fontSize: 14,
          }}
        >
          <strong>Error:</strong> {error}
          <button
            onClick={load}
            style={{
              marginLeft: 16, padding: "4px 14px", borderRadius: 6,
              border: "1px solid var(--red, #e53)", background: "transparent",
              color: "var(--red, #e53)", cursor: "pointer", fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: "center", padding: "60px 24px",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Inbox Zero!</div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            {statusFilter === "pending"
              ? "No pending memories. All caught up!"
              : `No ${statusFilter} items found.`}
          </div>
          {statusFilter !== "pending" && (
            <button
              onClick={() => setStatusFilter("pending")}
              style={{
                marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "none",
                background: "var(--violet)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              }}
            >
              View pending
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <DraftCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
              onEdit={setEditingItem}
            />
          ))}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onSave={handleEditSave}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          kind={toast.kind}
          onDismiss={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
