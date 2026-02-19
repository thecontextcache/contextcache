"use client";

import { useEffect, useMemo, useState } from "react";

function buildDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function AdminPage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(), []);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState([]);
  const [error, setError] = useState("");

  async function apiRequest(path, init = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Request failed");
    return body;
  }

  async function load() {
    try {
      const [inviteRows, userRows, usageRows] = await Promise.all([
        apiRequest("/admin/invites"),
        apiRequest("/admin/users"),
        apiRequest("/admin/usage"),
      ]);
      setInvites(inviteRows);
      setUsers(userRows);
      setUsage(usageRows);
    } catch (err) {
      setError(err.message || "Admin access required");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createInvite(event) {
    event.preventDefault();
    setError("");
    try {
      await apiRequest("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email, notes }),
      });
      setEmail("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err.message || "Failed to create invite");
    }
  }

  async function revokeInvite(id) {
    try {
      await apiRequest(`/admin/invites/${id}/revoke`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message || "Failed to revoke invite");
    }
  }

  return (
    <main className="stack-lg">
      <section className="card">
        <h1>Admin</h1>
        <p className="muted">Invite-only alpha controls and basic usage visibility.</p>
      </section>

      <section className="card">
        <h2>Create Invite</h2>
        <form onSubmit={createInvite} className="stack">
          <input type="email" required placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="submit" className="btn primary">Create invite</button>
        </form>
      </section>

      <section className="card">
        <h2>Invites</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.revoked_at ? "revoked" : i.accepted_at ? "accepted" : "pending"}</td>
                  <td>{new Date(i.expires_at).toLocaleString()}</td>
                  <td>{!i.revoked_at ? <button className="btn secondary" onClick={() => revokeInvite(i.id)}>Revoke</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Users</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Admin</th><th>Last login</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}><td>{u.email}</td><td>{u.is_admin ? "yes" : "no"}</td><td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Usage</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Count</th></tr></thead>
            <tbody>
              {usage.map((row, idx) => (
                <tr key={`${row.date}-${row.event_type}-${idx}`}>
                  <td>{row.date}</td>
                  <td>{row.event_type}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
