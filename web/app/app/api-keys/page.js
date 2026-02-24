"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../../components/toast";
import { Skeleton } from "../../components/skeleton";


// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  // Use a fixed locale ("en-GB") so server (Docker/Node) and browser produce
  // identical output. Using undefined locale is hydration-unsafe because Docker
  // defaults to the C locale while browsers use the user's system locale.
  if (typeof window === "undefined") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  // Guard: Date.now() differs between server and client, causing React #425
  // (text content mismatch). Only compute relative time in the browser.
  if (typeof window === "undefined") return "—";
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

function StatusPill({ revoked }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 10px", borderRadius: 999, fontSize: "0.72rem",
      fontWeight: 700, letterSpacing: "0.04em",
      background: revoked ? "rgba(239,68,68,0.12)" : "rgba(0,229,160,0.12)",
      color: revoked ? "#ef4444" : "#00e5a0",
      border: `1px solid ${revoked ? "#ef444430" : "#00e5a030"}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: revoked ? "#ef4444" : "#00e5a0",
        display: "inline-block",
      }} />
      {revoked ? "Revoked" : "Active"}
    </span>
  );
}

// ── One-time key reveal banner ────────────────────────────────────────────────

function NewKeyBanner({ apiKey, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.3)",
      borderRadius: 12, padding: "20px 24px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#00e5a0", marginBottom: 4 }}>
            ✓ API Key Created — Copy it now
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            This is the only time the full key will be shown. Store it in a password manager or your server&apos;s .env file.
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <code style={{
          flex: 1, padding: "12px 16px", borderRadius: 8,
          background: "var(--bg)", border: "1px solid rgba(0,229,160,0.3)",
          fontFamily: "var(--mono)", fontSize: "0.88rem", color: "var(--ink)",
          wordBreak: "break-all", userSelect: "all",
        }}>
          {apiKey}
        </code>
        <button
          onClick={copy}
          className="btn primary sm"
          style={{ whiteSpace: "nowrap", minWidth: 90 }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--muted)" }}>
        Use as: <code style={{ fontFamily: "var(--mono)", color: "var(--ink-2)" }}>X-API-Key: {apiKey}</code>
      </div>
    </div>
  );
}

// ── Confirm revoke modal ──────────────────────────────────────────────────────

function ConfirmModal({ keyName, keyPrefix, onConfirm, onCancel, loading }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--line)",
        borderRadius: 16, padding: 32, maxWidth: 420, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem", color: "var(--ink)" }}>
          Revoke API Key?
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 20px" }}>
          Revoking <strong style={{ color: "var(--ink)", fontFamily: "var(--mono)" }}>{keyPrefix}…</strong>
          {keyName ? ` (${keyName})` : ""} is permanent.
          Any service using this key will immediately lose access.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="btn"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Revoking…" : "Yes, revoke it"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const router = useRouter();
  const toast = useToast();

  // Auth / org
  const [orgId, setOrgId] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  // Keys
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(true);

  // Create form
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null); // one-time reveal

  // Revoke
  const [confirmRevoke, setConfirmRevoke] = useState(null); // { id, name, prefix }
  const [revoking, setRevoking] = useState(false);

  // Audit log
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const keyNameRef = useRef(null);

  // ── Bootstrap: resolve org ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgs = await apiFetch("/me/orgs");
        if (cancelled) return;
        if (!orgs?.length) { router.push("/auth"); return; }
        const org = orgs[0];
        setOrgId(org.id);
        setOrgName(org.name);
        localStorage.setItem("CONTEXTCACHE_ORG_ID", String(org.id));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.push("/auth");
        } else {
          toast.error("Could not load your organisation.");
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load keys whenever orgId is known ──────────────────────────────────────

  const loadKeys = useCallback(async () => {
    if (!orgId) return;
    setKeysLoading(true);
    try {
      const data = await apiFetch(`/orgs/${orgId}/api-keys`);
      setKeys(data ?? []);
    } catch (e) {
      toast.error(e.message ?? "Failed to load API keys.");
    } finally {
      setKeysLoading(false);
    }
  // toast is intentionally omitted — it changes reference every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadAuditLogs = useCallback(async () => {
    if (!orgId) return;
    setLogsLoading(true);
    try {
      const data = await apiFetch(`/orgs/${orgId}/audit-logs?limit=50`);
      const keyEvents = (data ?? []).filter(
        (l) => l.action?.startsWith("api_key.")
      );
      setAuditLogs(keyEvents);
    } catch {
      // Audit logs are best-effort
    } finally {
      setLogsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      loadKeys();
      loadAuditLogs();
    }
  }, [orgId, loadKeys, loadAuditLogs]);

  // ── Create key ──────────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!keyName.trim() || creating) return;
    setCreating(true);
    setNewKey(null);
    try {
      const data = await apiFetch(`/orgs/${orgId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: keyName.trim() }),
      });
      setNewKey(data.api_key); // shown once
      setKeyName("");
      toast.success("API key created — copy it now!");
      await loadKeys();
      await loadAuditLogs();
      keyNameRef.current?.focus();
    } catch (e) {
      toast.error(e.message ?? "Failed to create API key.");
    } finally {
      setCreating(false);
    }
  };

  // ── Revoke key ──────────────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!confirmRevoke || revoking) return;
    setRevoking(true);
    try {
      await apiFetch(`/orgs/${orgId}/api-keys/${confirmRevoke.id}/revoke`, {
        method: "POST",
      });
      toast.success(`Key "${confirmRevoke.name || confirmRevoke.prefix}" revoked.`);
      setConfirmRevoke(null);
      await loadKeys();
      await loadAuditLogs();
    } catch (e) {
      toast.error(e.message ?? "Failed to revoke key.");
    } finally {
      setRevoking(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div style={{ padding: "60px 24px", maxWidth: 680, margin: "0 auto" }}>
        <Skeleton height={32} style={{ marginBottom: 16 }} />
        <Skeleton height={120} />
      </div>
    );
  }

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <>
      {confirmRevoke && (
        <ConfirmModal
          keyName={confirmRevoke.name}
          keyPrefix={confirmRevoke.prefix}
          onConfirm={handleRevoke}
          onCancel={() => setConfirmRevoke(null)}
          loading={revoking}
        />
      )}

      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        {/* ── Header ── */}
        <div style={{
          borderBottom: "1px solid var(--line)", padding: "20px 28px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>API Keys</h1>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
              {orgName && <>{orgName} · </>}{activeKeys.length} active key{activeKeys.length !== 1 ? "s" : ""}
            </div>
          </div>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="btn ghost sm">
            API Docs ↗
          </a>
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>

          {/* ── One-time key reveal ── */}
          {newKey && (
            <NewKeyBanner apiKey={newKey} onDismiss={() => setNewKey(null)} />
          )}

          {/* ── Create new key ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Create a New API Key</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 16px" }}>
              Give the key a descriptive name so you know where it&apos;s used — e.g. <em>&quot;Chrome Extension&quot;</em>, <em>&quot;CI Pipeline&quot;</em>, <em>&quot;Cursor Agent&quot;</em>.
            </p>
            <form onSubmit={handleCreate} style={{ display: "flex", gap: 10 }}>
              <input
                ref={keyNameRef}
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Chrome Extension"
                maxLength={100}
                disabled={creating}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="btn primary"
                disabled={!keyName.trim() || creating}
                aria-busy={creating}
                style={{ whiteSpace: "nowrap" }}
              >
                {creating && <span className="spinner" />}
                {creating ? "Creating…" : "Generate Key"}
              </button>
            </form>
          </div>

          {/* ── Active keys ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
              Active Keys
              {!keysLoading && (
                <span className="badge badge-brand">{activeKeys.length}</span>
              )}
            </h2>

            {keysLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Skeleton height={52} />
                <Skeleton height={52} />
              </div>
            ) : activeKeys.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "32px 16px",
                color: "var(--muted)", fontSize: "0.88rem",
              }}>
                No active API keys. Create one above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeKeys.map((key) => (
                  <KeyRow
                    key={key.id}
                    apiKey={key}
                    onRevoke={() => setConfirmRevoke({ id: key.id, name: key.name, prefix: key.prefix })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Usage / Audit trail ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>Key Activity Log</h2>
              <button
                className="btn ghost sm"
                onClick={() => { loadAuditLogs(); loadKeys(); }}
              >
                ↻ Refresh
              </button>
            </div>

            {logsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--muted)", fontSize: "0.85rem" }}>
                No key-related activity yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {auditLogs.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>

          {/* ── Revoked keys (collapsed by default) ── */}
          {revokedKeys.length > 0 && (
            <RevokedSection keys={revokedKeys} />
          )}

          {/* ── Usage guide ── */}
          <UsageGuide />

        </div>
      </div>
    </>
  );
}

// ── KeyRow ────────────────────────────────────────────────────────────────────

function KeyRow({ apiKey, onRevoke }) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line-2)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      {/* Top row: name + status + revoke */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>
            {apiKey.name || <em style={{ color: "var(--muted)" }}>Unnamed</em>}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
            {apiKey.prefix}••••••••••••••••
          </div>
        </div>
        <StatusPill revoked={!!apiKey.revoked_at} />
        {!apiKey.revoked_at && (
          <button
            className="btn ghost sm"
            onClick={onRevoke}
            style={{ color: "var(--danger, #ef4444)", borderColor: "rgba(239,68,68,0.3)", whiteSpace: "nowrap" }}
          >
            Revoke
          </button>
        )}
      </div>

      {/* Bottom row: usage stats */}
      <div style={{
        display: "flex", gap: 20, marginTop: 10, paddingTop: 10,
        borderTop: "1px solid var(--line-2)", flexWrap: "wrap",
      }}>
        <Stat label="Created" value={fmtDate(apiKey.created_at)} />
        <Stat
          label="Last used"
          value={apiKey.last_used_at ? fmtDateTime(apiKey.last_used_at) : "Never"}
          dim={!apiKey.last_used_at}
        />
        <Stat
          label="Total requests"
          value={apiKey.use_count?.toLocaleString() ?? "0"}
          highlight={apiKey.use_count > 0}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, dim, highlight }) {
  return (
    <div>
      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: "0.82rem", fontWeight: 600,
        color: dim ? "var(--muted)" : highlight ? "#00e5a0" : "var(--ink)",
        fontFamily: highlight || label === "Total requests" ? "var(--mono)" : "inherit",
      }}>
        {value}
      </div>
    </div>
  );
}

// ── AuditRow ──────────────────────────────────────────────────────────────────

const ACTION_LABELS = {
  "api_key.create": { label: "Key created", color: "#00e5a0" },
  "api_key.revoke": { label: "Key revoked", color: "#ef4444" },
};

function AuditRow({ log }) {
  const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: "var(--muted)" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 14px", borderRadius: 8,
      background: "var(--bg-2)", border: "1px solid var(--line-2)",
      fontSize: "0.82rem",
    }}>
      <span style={{
        fontWeight: 700, color: meta.color, minWidth: 110,
        fontFamily: "var(--mono)", fontSize: "0.75rem",
      }}>
        {meta.label}
      </span>
      <span style={{ color: "var(--muted)", flex: 1 }}>
        {log.metadata?.name && <><strong style={{ color: "var(--ink)" }}>{log.metadata.name}</strong> · </>}
        prefix: <code style={{ fontFamily: "var(--mono)" }}>{log.metadata?.prefix ?? "—"}</code>
      </span>
      <span style={{ color: "var(--muted)", whiteSpace: "nowrap", fontSize: "0.75rem" }}>
        {fmtDateTime(log.created_at)}
      </span>
    </div>
  );
}

// ── Revoked section ───────────────────────────────────────────────────────────

function RevokedSection({ keys }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 24 }}>
      <button
        className="btn ghost sm"
        onClick={() => setOpen((o) => !o)}
        style={{ marginBottom: open ? 12 : 0 }}
      >
        {open ? "▲" : "▼"} {keys.length} revoked key{keys.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                background: "var(--bg-2)", border: "1px solid var(--line-2)",
                borderRadius: 10, padding: "10px 16px", opacity: 0.6,
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{k.name || "Unnamed"}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted)" }}>
                  {k.prefix}••••••••••••••••
                </div>
              </div>
              <StatusPill revoked />
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Revoked {fmtDate(k.revoked_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Usage guide ───────────────────────────────────────────────────────────────

function UsageGuide() {
  const [copied, setCopied] = useState(null);

  const copy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const snippets = [
    {
      id: "curl",
      label: "curl",
      code: `curl -X POST "https://api.thecontextcache.com/ingest/raw" \\
  -H "X-API-Key: YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"cli","project_id":1,"payload":{"text":"Your insight here"}}'`,
    },
    {
      id: "python",
      label: "Python",
      code: `import httpx

resp = httpx.post(
    "https://api.thecontextcache.com/ingest/raw",
    headers={"X-API-Key": "YOUR_KEY_HERE"},
    json={"source": "cli", "project_id": 1,
          "payload": {"text": "Your insight here"}},
)
print(resp.json())`,
    },
    {
      id: "env",
      label: ".env",
      code: `# Add to your project .env
CC_API_KEY=YOUR_KEY_HERE
CC_PROJECT_ID=1`,
    },
  ];

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>How to Use Your Key</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 16px" }}>
        Pass the key in the <code style={{ fontFamily: "var(--mono)" }}>X-API-Key</code> header on every request.
      </p>

      {snippets.map((s) => (
        <div key={s.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {s.label}
            </span>
            <button
              className="btn ghost sm"
              style={{ fontSize: "0.72rem", padding: "2px 8px" }}
              onClick={() => copy(s.id, s.code)}
            >
              {copied === s.id ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <pre style={{
            background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: 8, padding: "12px 16px", margin: 0,
            fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--ink-2)",
            overflowX: "auto", whiteSpace: "pre",
          }}>
            {s.code}
          </pre>
        </div>
      ))}
    </div>
  );
}
