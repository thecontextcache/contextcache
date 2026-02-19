"use client";

import Link from "next/link";
import { useState } from "react";
import { buildApiBase } from "../lib/api";

export default function WaitlistPage() {
  const [email, setEmail]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");
  const [errorKind, setErrorKind] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setErrorKind("");
    setSubmitting(true);

    try {
      const res = await fetch(`${buildApiBase()}/waitlist/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      if (res.status === 429) {
        setError("Too many requests — wait a moment and try again.");
        setErrorKind("rate_limit");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Cannot reach the server. Check your connection.");
      setErrorKind("network");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="auth-wrap card">
        <div className="verify-state">
          <span style={{ fontSize: "2.5rem" }}>🎉</span>
          <h1>You&rsquo;re on the list</h1>
          <p className="muted" style={{ maxWidth: 320, textAlign: "center" }}>
            We&rsquo;ll reach out when your spot is ready. We onboard in small
            batches to keep quality high.
          </p>
          <div className="row" style={{ gap: 10, justifyContent: "center", marginTop: 8 }}>
            <Link href="/" className="btn secondary sm">← Back to home</Link>
            <Link href="/auth" className="btn ghost sm">Already invited? Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap card">
      <p className="alpha-banner" style={{ marginBottom: 16, display: "inline-flex" }}>
        Invite-only alpha
      </p>
      <h1>Join the Waitlist</h1>
      <p className="sub">
        TheContextCache is in invite-only alpha. Drop your email and we&rsquo;ll
        let you know when a spot opens up.
      </p>

      <form onSubmit={submit} className="stack" noValidate>
        <div className="field">
          <label htmlFor="wl-email">Email address</label>
          <input
            id="wl-email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={submitting}
          />
        </div>

        <button
          type="submit"
          className={`btn primary${submitting ? " loading" : ""}`}
          disabled={submitting || !email.trim()}
          aria-busy={submitting}
        >
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </form>

      {error && (
        <div
          className={`alert ${errorKind === "network" ? "err" : errorKind === "rate_limit" ? "warn" : "err"}`}
          role="alert"
          style={{ marginTop: 12 }}
        >
          {errorKind === "network" && <span>📡 </span>}
          {errorKind === "rate_limit" && <span>⏱ </span>}
          {error}
        </div>
      )}

      <hr className="divider" style={{ margin: "20px 0" }} />
      <p className="muted" style={{ textAlign: "center", fontSize: "0.85rem" }}>
        Already have an invite?{" "}
        <Link href="/auth" style={{ color: "var(--brand)" }}>Sign in here</Link>
      </p>
    </div>
  );
}
