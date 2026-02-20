"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

export default function VerifyClient({ token }) {
  const router = useRouter();
  const [phase, setPhase] = useState("verifying"); // verifying | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setPhase("error");
      setErrorMsg("Missing or invalid token. Request a new sign-in link.");
      return;
    }

    async function verify() {
      try {
        // IMPORTANT: must go through apiFetch (same-origin /api proxy) so the
        // Set-Cookie response header is from the same origin as the page.
        // A cross-origin fetch (directly to :8000) would cause browsers to
        // silently drop the session cookie due to SameSite=Lax rules.
        await apiFetch(`/auth/verify?token=${encodeURIComponent(token)}`, {
          method: "GET",
        });
        setPhase("success");
        setTimeout(() => router.replace("/app"), 1200);
      } catch (err) {
        setPhase("error");
        setErrorMsg(
          err?.status === 410
            ? "This link has expired or already been used. Request a new one."
            : err?.message || "Verification failed. Request a new sign-in link."
        );
      }
    }

    verify();
  }, [token, router]);

  return (
    <div className="auth-wrap card">
      {phase === "verifying" && (
        <div className="verify-state">
          <div className="verify-spinner" aria-hidden="true" />
          <h1>Verifying…</h1>
          <p className="muted">Checking your sign-in link, one moment.</p>
        </div>
      )}

      {phase === "success" && (
        <div className="verify-state">
          <span style={{ fontSize: "2.5rem" }}>✓</span>
          <h1>Signed in!</h1>
          <p className="muted">Redirecting to your workspace…</p>
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            Continuing means you accept the{" "}
            <Link href="/legal#data-privacy">Terms &amp; Privacy</Link>.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="verify-state">
          <span style={{ fontSize: "2.5rem" }}>✕</span>
          <h1>Verification failed</h1>
          <div className="alert err" role="alert">{errorMsg}</div>
          <div className="row-wrap" style={{ justifyContent: "center", marginTop: 8 }}>
            <Link href="/auth" className="btn primary">
              Request a new link
            </Link>
            <Link href="/" className="btn secondary">
              Home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
