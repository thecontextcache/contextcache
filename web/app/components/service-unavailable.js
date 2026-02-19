"use client";

import { useEffect, useRef, useState } from "react";
import { buildApiBase, checkHealth } from "../lib/api";

export function ServiceUnavailable({ onRecover }) {
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const timerRef = useRef(null);

  async function retry() {
    setRetrying(true);
    const ok = await checkHealth();
    setRetrying(false);
    if (ok) {
      onRecover?.();
    } else {
      setCountdown(10);
    }
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          retry();
          return 10;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const apiBase = buildApiBase();

  return (
    <div className="svc-unavail" role="alert" aria-live="assertive">
      <div className="svc-orbs" aria-hidden="true">
        <span className="orb orb1" />
        <span className="orb orb2" />
        <span className="orb orb3" />
      </div>
      <p className="svc-brand">TheContextCache™</p>
      <h1 className="svc-heading">Service Temporarily Unavailable</h1>
      <p className="svc-sub">
        We can&apos;t reach the backend right now. This is usually brief.
      </p>
      <p className="svc-hint">
        Detected API endpoint:{" "}
        <code className="svc-url">{apiBase}</code>
      </p>
      <div className="svc-actions">
        <button
          className="btn primary"
          onClick={retry}
          disabled={retrying}
          aria-busy={retrying}
        >
          {retrying ? "Checking…" : "Retry now"}
        </button>
      </div>
      <p className="svc-auto">
        {retrying ? "Checking…" : `Auto-retrying in ${countdown}s`}
      </p>
      <div className="svc-tips">
        <p className="svc-tips-head">Troubleshooting tips</p>
        <ul>
          <li>Make sure the API container is running: <code>docker compose ps</code></li>
          <li>Check logs: <code>docker compose logs -n 50 api</code></li>
          <li>Verify CORS_ORIGINS includes this origin in your <code>.env</code></li>
        </ul>
      </div>
    </div>
  );
}
