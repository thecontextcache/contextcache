"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { SkeletonCard } from "../components/skeleton";
import { motion, AnimatePresence } from "framer-motion";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "waitlist", label: "Waitlist" },
  { id: "invites", label: "Invites" },
  { id: "users", label: "Users" },
  { id: "login-ips", label: "Login IPs" },
  { id: "usage", label: "Usage" },
];

function StatusBadge({ status }) {
  const map = {
    pending: "badge-warn",
    approved: "badge-ok",
    rejected: "badge-danger",
    active: "badge-ok",
    disabled: "badge-danger",
    accepted: "badge-ok",
    revoked: "badge-danger",
  };
  return <span className={`badge ${map[status] || "badge-brand"}`}>{status}</span>;
}

export default function AdminPage() {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("waitlist");

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waitlist, setWaitlist] = useState([]);
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState([]);

  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const [waitlistFilter, setWaitlistFilter] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState("all");
  const [inviteFilter, setInviteFilter] = useState("");
  const [inviteStatus, setInviteStatus] = useState("all");
  const [userFilter, setUserFilter] = useState("");
  const [userStatus, setUserStatus] = useState("all");

  // Login IPs tab state
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [loginEvents, setLoginEvents] = useState([]);
  const [loginEventsLoading, setLoginEventsLoading] = useState(false);

  // Per-user stats (loaded on demand)
  const [userStats, setUserStats] = useState({});   // { [userId]: { memory_count, today_* } }
  const [statsLoading, setStatsLoading] = useState({});

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
      if (!me.is_admin) {
        router.replace("/app");
        return;
      }
      setIsAdmin(true);
    } catch (err) {
      handleErr(err);
      // Do not unset loading to prevent UI flash before redirect
      if (!(err instanceof ApiError && (err.kind === "auth" || err.kind === "forbidden"))) {
        setLoading(false);
      }
      return;
    }

    const [wlRes, inviteRes, userRes, usageRes] = await Promise.allSettled([
      apiFetch("/admin/waitlist"),
      apiFetch("/admin/invites"),
      apiFetch("/admin/users"),
      apiFetch("/admin/usage"),
    ]);

    if (wlRes.status === "fulfilled") setWaitlist(wlRes.value);
    else toast.error(`Waitlist: ${wlRes.reason?.message || "failed to load"}`);

    if (inviteRes.status === "fulfilled") setInvites(inviteRes.value);
    else toast.error(`Invites: ${inviteRes.reason?.message || "failed to load"}`);

    if (userRes.status === "fulfilled") setUsers(userRes.value);
    else toast.error(`Users: ${userRes.reason?.message || "failed to load"}`);

    if (usageRes.status === "fulfilled") setUsage(usageRes.value);
    else toast.error(`Usage: ${usageRes.reason?.message || "failed to load"}`);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Waitlist actions ──────────────────────────────────────────────────────
  async function approveWaitlist(id, wlEmail) {
    try {
      await apiFetch(`/admin/waitlist/${id}/approve`, { method: "POST" });
      toast.success(`${wlEmail} approved — invite created.`);
      await load();
    } catch (err) { handleErr(err); }
  }

  async function rejectWaitlist(id, wlEmail) {
    try {
      await apiFetch(`/admin/waitlist/${id}/reject`, { method: "POST" });
      toast.info(`${wlEmail} rejected.`);
      await load();
    } catch (err) { handleErr(err); }
  }

  // ── Invite actions ────────────────────────────────────────────────────────
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
    } catch (err) { handleErr(err); } finally { setCreating(false); }
  }

  async function revokeInvite(id, invEmail) {
    try {
      await apiFetch(`/admin/invites/${id}/revoke`, { method: "POST" });
      toast.success(`Invite for ${invEmail} revoked.`);
      await load();
    } catch (err) { handleErr(err); }
  }

  // ── User actions ──────────────────────────────────────────────────────────
  async function setUserDisabled(id, disabled) {
    try {
      await apiFetch(`/admin/users/${id}/${disabled ? "disable" : "enable"}`, { method: "POST" });
      toast.success(disabled ? "User disabled." : "User enabled.");
      await load();
    } catch (err) { handleErr(err); }
  }

  async function revokeSessions(id, userEmail) {
    try {
      await apiFetch(`/admin/users/${id}/revoke-sessions`, { method: "POST" });
      toast.success(`Sessions for ${userEmail} revoked.`);
      await load();
    } catch (err) { handleErr(err); }
  }

  async function setAdmin(id, userEmail, grant) {
    try {
      await apiFetch(`/admin/users/${id}/${grant ? "grant-admin" : "revoke-admin"}`, { method: "POST" });
      toast.success(`${userEmail} ${grant ? "granted" : "revoked"} admin.`);
      await load();
    } catch (err) { handleErr(err); }
  }

  async function setUnlimited(id, unlimited) {
    try {
      await apiFetch(`/admin/users/${id}/set-unlimited?unlimited=${unlimited}`, { method: "POST" });
      toast.success(unlimited ? "User marked as unlimited." : "Unlimited removed.");
      await load();
    } catch (err) { handleErr(err); }
  }

  async function loadUserStats(userId) {
    setStatsLoading((s) => ({ ...s, [userId]: true }));
    try {
      const stats = await apiFetch(`/admin/users/${userId}/stats`);
      setUserStats((s) => ({ ...s, [userId]: stats }));
    } catch (err) {
      toast.error(`Stats: ${err.message || "failed"}`);
    } finally {
      setStatsLoading((s) => ({ ...s, [userId]: false }));
    }
  }

  // ── Login event actions ───────────────────────────────────────────────────
  async function loadLoginEvents(userId, userEmail) {
    setSelectedUserId(userId);
    setSelectedUserEmail(userEmail);
    setLoginEventsLoading(true);
    setLoginEvents([]);
    try {
      const events = await apiFetch(`/admin/users/${userId}/login-events`);
      setLoginEvents(events || []);
    } catch (err) {
      toast.error(`Login IPs: ${err.message || "failed to load"}`);
    } finally {
      setLoginEventsLoading(false);
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 20;
  const [wlPage, setWlPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [userPage, setUserPage] = useState(1);

  // Reset to page 1 when filter changes
  const handleWlFilter = useCallback((v) => { setWaitlistFilter(v); setWlPage(1); }, []);
  const handleInvFilter = useCallback((v) => { setInviteFilter(v); setInvPage(1); }, []);
  const handleUserFilter = useCallback((v) => { setUserFilter(v); setUserPage(1); }, []);

  // ── Filtered views ────────────────────────────────────────────────────────
  const filteredWaitlist = useMemo(
    () => waitlist.filter((w) => {
      const emailOk = !waitlistFilter || w.email.toLowerCase().includes(waitlistFilter.toLowerCase());
      const statusOk = waitlistStatus === "all" || w.status === waitlistStatus;
      return emailOk && statusOk;
    }),
    [waitlist, waitlistFilter, waitlistStatus]
  );
  const filteredInvites = useMemo(
    () => invites.filter((i) => {
      const emailOk = !inviteFilter || i.email.toLowerCase().includes(inviteFilter.toLowerCase());
      const computedStatus = i.revoked_at ? "revoked" : i.accepted_at ? "accepted" : "pending";
      const statusOk = inviteStatus === "all" || computedStatus === inviteStatus;
      return emailOk && statusOk;
    }),
    [invites, inviteFilter, inviteStatus]
  );
  const filteredUsers = useMemo(
    () => users.filter((u) => {
      const emailOk = !userFilter || u.email.toLowerCase().includes(userFilter.toLowerCase());
      if (userStatus === "all") return emailOk;
      if (userStatus === "disabled") return emailOk && u.is_disabled;
      if (userStatus === "active") return emailOk && !u.is_disabled;
      if (userStatus === "admin") return emailOk && u.is_admin;
      if (userStatus === "unlimited") return emailOk && u.is_unlimited;
      return emailOk;
    }),
    [users, userFilter, userStatus]
  );

  // ── Paginated slices ──────────────────────────────────────────────────────
  const pagedWaitlist = useMemo(
    () => filteredWaitlist.slice((wlPage - 1) * PAGE_SIZE, wlPage * PAGE_SIZE),
    [filteredWaitlist, wlPage]
  );
  const pagedInvites = useMemo(
    () => filteredInvites.slice((invPage - 1) * PAGE_SIZE, invPage * PAGE_SIZE),
    [filteredInvites, invPage]
  );
  const pagedUsers = useMemo(
    () => filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE),
    [filteredUsers, userPage]
  );

  const maxUsage = Math.max(...usage.map((r) => r.count || 0), 1);
  const pendingCount = waitlist.filter((w) => w.status === "pending").length;

  if (loading || !isAdmin) {
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
      {/* ── Header ── */}
      <section className="card">
        <div className="row spread">
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Admin</h1>
              <span className="badge badge-warn">Alpha controls</span>
            </div>
            <p className="muted">Manage waitlist, invitations, users, and usage.</p>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {pendingCount > 0 && (
              <span className="badge badge-warn">{pendingCount} pending</span>
            )}
            <span className="badge badge-brand">{users.length} users</span>
            <span className="badge badge-ok">
              {invites.filter((i) => i.accepted_at && !i.revoked_at).length} accepted
            </span>
          </div>
        </div>
      </section>

      {/* ── Tab bar ── */}
      <div className="tab-bar" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`tab${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
            style={{ position: 'relative' }}
          >
            {label}
            {id === "waitlist" && pendingCount > 0 && (
              <span className="badge badge-warn" style={{ marginLeft: 6, fontSize: "0.65rem", padding: "1px 6px" }}>
                {pendingCount}
              </span>
            )}
            {activeTab === id && (
              <motion.div
                layoutId="activeTabIndicator"
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
        {/* ── Waitlist tab ── */}
        {activeTab === "waitlist" && (
          <motion.section
            key="waitlist"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="card"
          >
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>
                Waitlist
                <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                  {filteredWaitlist.length}
                </span>
              </h2>
              <div className="row" style={{ gap: 8 }}>
                <input
                  placeholder="Filter by email…"
                  value={waitlistFilter}
                  onChange={(e) => handleWlFilter(e.target.value)}
                  style={{ maxWidth: 220 }}
                  aria-label="Filter waitlist by email"
                />
                <select
                  value={waitlistStatus}
                  onChange={(e) => { setWaitlistStatus(e.target.value); setWlPage(1); }}
                  style={{ width: 140 }}
                  aria-label="Filter waitlist by status"
                >
                  <option value="all">all</option>
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWaitlist.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                        {waitlistFilter ? "No entries match." : "Waitlist is empty."}
                      </td>
                    </tr>
                  )}
                  {pagedWaitlist.map((w) => (
                    <tr key={w.id}>
                      <td className="mono">{w.email}</td>
                      <td><StatusBadge status={w.status} /></td>
                      <td className="muted" style={{ fontSize: "0.8rem" }}>
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                      <td className="muted" style={{ fontSize: "0.82rem" }}>{w.notes || "—"}</td>
                      <td>
                        {w.status === "pending" && (
                          <div className="td-actions">
                            <button className="btn primary sm" onClick={() => approveWaitlist(w.id, w.email)}>
                              Approve
                            </button>
                            <button className="btn danger sm" onClick={() => rejectWaitlist(w.id, w.email)}>
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator total={filteredWaitlist.length} page={wlPage} pageSize={PAGE_SIZE} onPage={setWlPage} />
          </motion.section>
        )}

        {/* ── Invites tab ── */}
        {activeTab === "invites" && (
          <motion.div key="invites" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="stack-lg">
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

            <section className="card">
              <div className="row spread" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>
                  Invitations
                  <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                    {filteredInvites.length}
                  </span>
                </h2>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    placeholder="Filter by email…"
                    value={inviteFilter}
                    onChange={(e) => handleInvFilter(e.target.value)}
                    style={{ maxWidth: 220 }}
                    aria-label="Filter invitations by email"
                  />
                  <select
                    value={inviteStatus}
                    onChange={(e) => { setInviteStatus(e.target.value); setInvPage(1); }}
                    style={{ width: 140 }}
                    aria-label="Filter invitations by status"
                  >
                    <option value="all">all</option>
                    <option value="pending">pending</option>
                    <option value="accepted">accepted</option>
                    <option value="revoked">revoked</option>
                  </select>
                </div>
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
                      <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No invitations found.</td></tr>
                    )}
                    {pagedInvites.map((i) => (
                      <tr key={i.id}>
                        <td className="mono">{i.email}</td>
                        <td>
                          <StatusBadge status={i.revoked_at ? "revoked" : i.accepted_at ? "accepted" : "pending"} />
                        </td>
                        <td className="muted" style={{ fontSize: "0.8rem" }}>
                          {new Date(i.expires_at).toLocaleDateString()}
                        </td>
                        <td className="muted" style={{ fontSize: "0.82rem" }}>{i.notes || "—"}</td>
                        <td>
                          {!i.revoked_at && !i.accepted_at && (
                            <button className="btn danger sm" onClick={() => revokeInvite(i.id, i.email)}>
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginator total={filteredInvites.length} page={invPage} pageSize={PAGE_SIZE} onPage={setInvPage} />
            </section>
          </motion.div>
        )}

        {/* ── Users tab ── */}
        {activeTab === "users" && (
          <motion.section key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="card">
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>
                Users
                <span className="badge badge-brand" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                  {filteredUsers.length}
                </span>
              </h2>
              <div className="row" style={{ gap: 8 }}>
                <input
                  placeholder="Filter by email…"
                  value={userFilter}
                  onChange={(e) => handleUserFilter(e.target.value)}
                  style={{ maxWidth: 220 }}
                  aria-label="Filter users by email"
                />
                <select
                  value={userStatus}
                  onChange={(e) => { setUserStatus(e.target.value); setUserPage(1); }}
                  style={{ width: 140 }}
                  aria-label="Filter users by status"
                >
                  <option value="all">all</option>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                  <option value="admin">admin</option>
                  <option value="unlimited">unlimited</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Last login</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No users found.</td></tr>
                  )}
                  {pagedUsers.map((u) => {
                    const stats = userStats[u.id];
                    const statsLoaded = stats !== undefined;
                    return (
                      <React.Fragment key={u.id}>
                        <tr>
                          <td className="mono">{u.email}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {u.is_admin && <span className="badge badge-brand" style={{ marginRight: 4 }}>admin</span>}
                            {u.is_unlimited && <span className="badge badge-ok" title="No daily usage limits">∞ unlimited</span>}
                            {!u.is_admin && !u.is_unlimited && <span className="muted">—</span>}
                          </td>
                          <td className="muted" style={{ fontSize: "0.8rem" }}>
                            {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "never"}
                          </td>
                          <td>
                            <StatusBadge status={u.is_disabled ? "disabled" : "active"} />
                          </td>
                          <td>
                            <div className="td-actions" style={{ flexWrap: "wrap" }}>
                              <button className="btn secondary sm" onClick={() => setUserDisabled(u.id, !u.is_disabled)}>
                                {u.is_disabled ? "Enable" : "Disable"}
                              </button>
                              <button className="btn secondary sm" onClick={() => revokeSessions(u.id, u.email)}>
                                Revoke sessions
                              </button>
                              <button
                                className={`btn sm ${u.is_admin ? "danger" : "secondary"}`}
                                onClick={() => setAdmin(u.id, u.email, !u.is_admin)}
                                title={u.is_admin ? "Remove admin privileges" : "Grant admin privileges"}
                              >
                                {u.is_admin ? "Revoke admin" : "Grant admin"}
                              </button>
                              <button
                                className={`btn sm ${u.is_unlimited ? "danger" : "secondary"}`}
                                onClick={() => setUnlimited(u.id, !u.is_unlimited)}
                                title={u.is_unlimited ? "Remove unlimited limits bypass" : "Remove all daily usage limits for this user"}
                              >
                                {u.is_unlimited ? "Set limited" : "Set unlimited"}
                              </button>
                              <button
                                className="btn secondary sm"
                                onClick={() => statsLoaded ? setUserStats((s) => { const n = { ...s }; delete n[u.id]; return n; }) : loadUserStats(u.id)}
                                title="Toggle usage stats"
                              >
                                {statsLoading[u.id] ? "Loading…" : statsLoaded ? "Hide stats" : "Stats"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {statsLoaded && (
                          <tr style={{ background: "var(--panel-2)" }}>
                            <td colSpan={5} style={{ padding: "6px 12px 10px 12px" }}>
                              <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.82rem", color: "var(--ink-2)", flexWrap: "wrap" }}>
                                <span>Total memories: <strong style={{ color: "var(--brand)" }}>{stats.memory_count}</strong></span>
                                <span>Today memories: <strong>{stats.today_memories}</strong></span>
                                <span>Today recalls: <strong>{stats.today_recalls}</strong></span>
                                <span>Today projects: <strong>{stats.today_projects}</strong></span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                </tbody>
              </table>
            </div>
            <Paginator total={filteredUsers.length} page={userPage} pageSize={PAGE_SIZE} onPage={setUserPage} />
          </motion.section>
        )}

        {/* ── Login IPs tab ── */}
        {activeTab === "login-ips" && (
          <motion.div key="login-ips" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="stack-lg">
            <section className="card">
              <h2 style={{ marginBottom: 8 }}>Login IP History</h2>
              <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
                Select a user to view their last 10 login IP addresses and timestamps.
                IPs are stored verbatim — no tokens, cookies, or secrets are shown.
              </p>

              {/* User picker */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Last login</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                          No users found.
                        </td>
                      </tr>
                    )}
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        style={selectedUserId === u.id ? { background: "var(--panel-2)" } : {}}
                      >
                        <td className="mono">{u.email}</td>
                        <td className="muted" style={{ fontSize: "0.8rem" }}>
                          {u.last_login_at
                            ? new Date(u.last_login_at).toLocaleString()
                            : "never"}
                        </td>
                        <td>
                          <StatusBadge status={u.is_disabled ? "disabled" : "active"} />
                        </td>
                        <td>
                          <button
                            className={`btn sm ${selectedUserId === u.id ? "primary" : "secondary"}`}
                            onClick={() => loadLoginEvents(u.id, u.email)}
                            aria-pressed={selectedUserId === u.id}
                          >
                            {selectedUserId === u.id ? "Viewing" : "View IPs"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Login events panel */}
            {selectedUserId !== null && (
              <section className="card">
                <div className="row spread" style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>
                    Login events for{" "}
                    <span className="mono" style={{ fontSize: "0.9em" }}>
                      {selectedUserEmail}
                    </span>
                  </h3>
                  <button
                    className="btn secondary sm"
                    onClick={() => loadLoginEvents(selectedUserId, selectedUserEmail)}
                    disabled={loginEventsLoading}
                  >
                    {loginEventsLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {loginEventsLoading ? (
                  <p className="muted">Loading…</p>
                ) : loginEvents.length === 0 ? (
                  <p className="muted">No login events recorded for this user.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>IP Address</th>
                          <th>Date &amp; Time (UTC)</th>
                          <th>User Agent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loginEvents.map((ev, idx) => (
                          <tr key={ev.id}>
                            <td className="muted" style={{ fontSize: "0.8rem" }}>{idx + 1}</td>
                            <td className="mono" style={{ fontSize: "0.88rem" }}>{ev.ip}</td>
                            <td className="muted" style={{ fontSize: "0.8rem" }}>
                              {new Date(ev.created_at).toUTCString()}
                            </td>
                            <td
                              className="muted"
                              style={{
                                fontSize: "0.75rem",
                                maxWidth: 280,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={ev.user_agent || ""}
                            >
                              {ev.user_agent || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="muted" style={{ fontSize: "0.75rem", marginTop: 10 }}>
                  Showing up to 10 most recent login events. Older records are automatically deleted.
                </p>
              </section>
            )}
          </motion.div>
        )}

        {/* ── Usage tab ── */}
        {activeTab === "usage" && (
          <motion.section key="usage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="card">
            <h2 style={{ marginBottom: 16 }}>Usage — last 30 days</h2>
            {usage.length === 0 ? (
              <p className="muted">No usage events recorded yet.</p>
            ) : (
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
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Paginator ────────────────────────────────────────────────────────────────

function Paginator({ total, page, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      paddingTop: 12, marginTop: 8,
      borderTop: "1px solid var(--line)",
      fontSize: "0.8rem", color: "var(--ink-2)",
    }}>
      <span>{start}–{end} of {total}</span>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          className="btn ghost sm"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          title="First page"
          style={{ padding: "2px 8px" }}
        >«</button>
        <button
          className="btn ghost sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          title="Previous page"
          style={{ padding: "2px 8px" }}
        >‹</button>
        <span style={{ padding: "2px 8px", color: "var(--ink)", fontWeight: 600 }}>
          {page} / {totalPages}
        </span>
        <button
          className="btn ghost sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          title="Next page"
          style={{ padding: "2px 8px" }}
        >›</button>
        <button
          className="btn ghost sm"
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          title="Last page"
          style={{ padding: "2px 8px" }}
        >»</button>
      </div>
    </div>
  );
}
