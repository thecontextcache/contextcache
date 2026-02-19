"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { SkeletonCard } from "../components/skeleton";

export default function AdminPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState([]);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteFilter, setInviteFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  function handleErr(err) {
    if (err instanceof ApiError) {
      if (err.kind === "auth") { router.replace("/auth?reason=expired"); return; }
      if (err.kind === "forbidden") { router.replace("/app"); return; }
    }
    toast.error(err.message || "Something went wrong.");
  }

  async function load() {
    setLoading(true);
    try {
      const me = await apiFetch("/auth/me");
      if (!me.is_admin) { router.replace("/app"); return; }
    } catch (err) {
      handleErr(err);
      setLoading(false);
      return;
    }

    // Fetch each section independently — one failure won't blank the others.
    const [inviteRes, userRes, usageRes] = await Promise.allSettled([
      apiFetch("/admin/invites"),
      apiFetch("/admin/users"),
      apiFetch("/admin/usage"),
    ]);

    if (inviteRes.status === "fulfilled") setInvites(inviteRes.value);
    else toast.error(`Invites: ${inviteRes.reason?.message || "failed to load"}`);

    if (userRes.status === "fulfilled") setUsers(userRes.value);
    else toast.error(`Users: ${userRes.reason?.message || "failed to load"}`);

    if (usageRes.status === "fulfilled") setUsage(usageRes.value);
    else toast.error(`Usage: ${usageRes.reason?.message || "failed to load"}`);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createInvite(e) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      await apiFetch("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), notes }),
      });
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
      setNotes("");
      await load();
    } catch (err) {
      handleErr(err);
    } finally {
      setCreating(false);
    }
  }

  async function revokeInvite(id, invEmail) {
    try {
      await apiFetch(`/admin/invites/${id}/revoke`, { method: "POST" });
      toast.success(`Invite for ${invEmail} revoked.`);
      await load();
    } catch (err) {
      handleErr(err);
    }
  }

  async function setUserDisabled(id, disabled) {
    try {
      await apiFetch(`/admin/users/${id}/${disabled ? "disable" : "enable"}`, { method: "POST" });
      toast.success(disabled ? "User disabled." : "User enabled.");
      await load();
    } catch (err) {
      handleErr(err);
    }
  }

  async function revokeSessions(id, userEmail) {
    try {
      await apiFetch(`/admin/users/${id}/revoke-sessions`, { method: "POST" });
      toast.success(`Sessions for ${userEmail} revoked.`);
      await load();
    } catch (err) {
      handleErr(err);
    }
  }

  const filteredInvites = useMemo(
    () => invites.filter((i) => !inviteFilter || i.email.toLowerCase().includes(inviteFilter.toLowerCase())),
    [invites, inviteFilter]
  );

  const filteredUsers = useMemo(
    () => users.filter((u) => !userFilter || u.email.toLowerCase().includes(userFilter.toLowerCase())),
    [users, userFilter]
  );

  const maxUsage = Math.max(...usage.map((r) => r.count || 0), 1);

  if (loading) {
    return (
      <div className="stack-lg">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      {/* Header */}
      <section className="card">
        <div className="row spread">
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Admin</h1>
              <span className="badge badge-warn">Alpha controls</span>
            </div>
            <p className="muted">Manage invitations, users, and monitor alpha usage.</p>
          </div>
          <div className="row">
            <span className="badge badge-brand">{users.length} users</span>
            <span className="badge badge-ok">{invites.filter((i) => i.accepted_at && !i.revoked_at).length} accepted</span>
          </div>
        </div>
      </section>

      {/* Create invite */}
      <section className="card">
        <h2 style={{ marginBottom: 14 }}>Send invitation</h2>
        <form onSubmit={createInvite} className="grid-2" style={{ alignItems: "end" }}>
          <div className="field">
            <label htmlFor="inv-email">Email address</label>
            <input
              id="inv-email"
              type="email"
              required
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-notes">Notes <span className="muted">(optional)</span></label>
            <input
              id="inv-notes"
              placeholder="e.g. From waitlist, referral"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={creating}
            />
          </div>
          <div style={{ paddingBottom: 1 }}>
            <button
              type="submit"
              className="btn primary"
              disabled={creating || !email.trim()}
              aria-busy={creating}
            >
              {creating && <span className="spinner" />}
              {creating ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </section>

      {/* Invites table */}
      <section className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>
            Invitations
            <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              {filteredInvites.length}
            </span>
          </h2>
          <input
            placeholder="Filter by email…"
            value={inviteFilter}
            onChange={(e) => setInviteFilter(e.target.value)}
            style={{ maxWidth: 220 }}
            aria-label="Filter invitations by email"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>No invitations found.</td></tr>
              )}
              {filteredInvites.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.email}</td>
                  <td>
                    <span className={`badge ${i.revoked_at ? "badge-danger" : i.accepted_at ? "badge-ok" : "badge-warn"}`}>
                      {i.revoked_at ? "revoked" : i.accepted_at ? "accepted" : "pending"}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: "0.8rem" }}>
                    {new Date(i.expires_at).toLocaleDateString()}
                  </td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>{i.notes || "—"}</td>
                  <td>
                    {!i.revoked_at && !i.accepted_at && (
                      <button
                        className="btn danger sm"
                        onClick={() => revokeInvite(i.id, i.email)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Users table */}
      <section className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>
            Users
            <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              {filteredUsers.length}
            </span>
          </h2>
          <input
            placeholder="Filter by email…"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={{ maxWidth: 220 }}
            aria-label="Filter users by email"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Admin</th>
                <th>Last login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>No users found.</td></tr>
              )}
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.email}</td>
                  <td>
                    {u.is_admin
                      ? <span className="badge badge-brand">admin</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="muted" style={{ fontSize: "0.8rem" }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "never"}
                  </td>
                  <td>
                    <span className={`badge ${u.is_disabled ? "badge-danger" : "badge-ok"}`}>
                      {u.is_disabled ? "disabled" : "active"}
                    </span>
                  </td>
                  <td>
                    <div className="td-actions">
                      <button
                        className="btn secondary sm"
                        onClick={() => setUserDisabled(u.id, !u.is_disabled)}
                      >
                        {u.is_disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        className="btn secondary sm"
                        onClick={() => revokeSessions(u.id, u.email)}
                      >
                        Revoke sessions
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Usage chart */}
      {usage.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Usage — last 30 days</h2>
          <div className="usage-chart">
            {usage.map((row, i) => (
              <div key={`${row.date}-${i}`} className="usage-bar-row">
                <span className="usage-bar-label" title={`${row.date} · ${row.event_type}`}>
                  {row.event_type}
                </span>
                <div className="usage-bar-track" aria-label={`${row.count} events`}>
                  <div
                    className="usage-bar-fill"
                    style={{ width: `${Math.round((row.count / maxUsage) * 100)}%` }}
                  />
                </div>
                <span className="usage-bar-count">{row.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
