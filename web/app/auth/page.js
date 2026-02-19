"use client";

import { useMemo, useState } from "react";

function buildDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function AuthPage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setStatus("");
    setError("");
    try {
      const response = await fetch(`${apiBase}/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || "Failed to send sign-in link");
      }
      setStatus("Check your email for a sign-in link.");
    } catch (err) {
      setError(err.message || "Failed to send sign-in link");
    }
  }

  return (
    <main className="auth-wrap card">
      <h1>Sign in</h1>
      <p>Enter your email and we will send a magic sign-in link.</p>
      <form onSubmit={submit} className="stack">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <button type="submit" className="btn primary">Send me a sign-in link</button>
      </form>
      {status ? <p className="ok">{status}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
