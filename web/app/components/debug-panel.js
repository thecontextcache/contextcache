"use client";

import { useState } from "react";
import { buildApiBase } from "../lib/api";

export function DebugPanel({ healthOk, lastError, session }) {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="debug-panel">
      <button
        className="debug-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="debug-content"
      >
        {open ? "▼" : "▶"} Debug
      </button>
      {open && (
        <div id="debug-content" className="debug-content">
          <dl className="debug-dl">
            <dt>API base</dt>
            <dd>{buildApiBase()}</dd>
            <dt>Health</dt>
            <dd className={healthOk ? "debug-ok" : "debug-err"}>
              {healthOk == null ? "checking…" : healthOk ? "ok" : "unreachable"}
            </dd>
            <dt>Session</dt>
            <dd>{session ? JSON.stringify(session) : "none"}</dd>
            <dt>Last error</dt>
            <dd className="debug-err">{lastError || "none"}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
