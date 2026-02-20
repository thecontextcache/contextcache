"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildApiBase } from "../lib/api";

export default function AuthPage() {
  const apiBase = useMemo(() => buildApiBase(), []);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState("");
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Ghost state cure: if we arrived via a forced middleware redirect due to an
  // expired/invalid HttpOnly cookie, the only way to delete it is via a backend call.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("reason=expired")) {
      fetch("/api/auth/clear", { method: "POST" }).catch(() => { });
      // Optional: clean the URL visually
      window.history.replaceState({}, document.title, "/auth");
    }
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setErrorKind("");
    setDebugLink("");
    setSubmitting(true);

    try {
      const res = await fetch(`${apiBase}/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          setError("This is an invite-only alpha. Join the waitlist to request access.");
          setErrorKind("forbidden");
          return;
        }
        if (res.status === 429) {
          setError("Too many requests. Wait a minute, then try again.");
          setErrorKind("rate_limit");
          return;
        }
        setError(body.detail || "Could not send a sign-in link. Please try again.");
        return;
      }

      setSent(true);
      if (body.debug_link) setDebugLink(body.debug_link);
    } catch {
      setError("Cannot reach the backend. Check that the API is running.");
      setErrorKind("network");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-wrap card">
        <div className="verify-state">
          <span style={{ fontSize: "2.5rem" }}>✉</span>
          <h1>Check your email</h1>
          <p className="sub">
            We sent a magic sign-in link to <strong>{email}</strong>.
            <br />
            Check your inbox (and spam folder).
          </p>
          <button
            className="btn ghost sm"
            onClick={() => { setSent(false); setDebugLink(""); }}
          >
            ← Try a different address
          </button>
        </div>

        {debugLink && (
          <div className="debug-link-box">
            <p>⚠ Dev mode — email not sent</p>
            <a href={debugLink} className="btn secondary sm">
              Continue with debug link →
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-wrap card">
      <p className="alpha-banner" style={{ marginBottom: 16, display: "inline-flex" }}>
        Invite-only alpha
      </p>
      <h1>Sign in</h1>
      <p className="sub">
        Enter your invited email and we&apos;ll send a magic sign-in link. No password needed.
      </p>

      <form onSubmit={submit} className="stack" noValidate>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            aria-describedby="email-hint"
            disabled={submitting}
          />
          <span id="email-hint" className="field-hint">
            Must match your invitation address.
          </span>
        </div>

        {/* Terms acceptance — wrapper must be div, not label, because the
            global `label { display:block }` and `input { width:100% }` rules
            would cause the checkbox to stretch full-width and push the text
            outside the card. Using div + htmlFor on the label text is valid
            and keeps the click-to-toggle behaviour intact. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
          <input
            id="terms-accept"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            style={{
              marginTop: 3,
              flexShrink: 0,
              width: "auto",
              cursor: "pointer",
              accentColor: "var(--brand)",
            }}
          />
          <label
            htmlFor="terms-accept"
            style={{
              fontSize: "0.82rem",
              color: "var(--ink-2)",
              fontWeight: "normal",
              lineHeight: 1.5,
              marginBottom: 0,
              cursor: "pointer",
            }}
          >
            I agree to the{" "}
            <Link
              href="/legal"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--brand)" }}
            >
              Terms of Service &amp; Privacy Policy
            </Link>
            {" "}of thecontextcache™. I understand this is an invite-only alpha
            and data may change.
          </label>
        </div>

        <button
          type="submit"
          className={`btn primary${submitting ? " loading" : ""}`}
          disabled={submitting || !email.trim() || !termsAccepted}
          aria-busy={submitting}
        >
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? "Sending…" : "Send me a sign-in link"}
        </button>
      </form>

      {error && (
        <div
          className={`alert ${errorKind === "forbidden" ? "warn" : errorKind === "network" ? "err" : "err"}`}
          role="alert"
          style={{ marginTop: 12 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span>
              {errorKind === "forbidden" && <span>🔒 </span>}
              {errorKind === "network" && <span>📡 </span>}
              {errorKind === "rate_limit" && <span>⏱ </span>}
              {error}
            </span>
            {errorKind === "forbidden" && (
              <Link
                href="/waitlist"
                className="btn primary sm"
                style={{ alignSelf: "flex-start" }}
              >
                Join the waitlist →
              </Link>
            )}
          </div>
        </div>
      )}

      <hr className="divider" style={{ margin: "20px 0" }} />
      <p className="muted" style={{ textAlign: "center" }}>
        Access is invite-only.{" "}
        <a href="mailto:support@thecontextcache.com">Contact support</a> to request an invitation.
      </p>
    </div>
  );
}
