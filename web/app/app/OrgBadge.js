"use client";

import { useEffect, useState } from "react";

// Reads the active workspace name from localStorage after mount.
// Separated from the layout so the layout stays a server component
// (server components cannot cause hydration mismatches).
export default function OrgBadge() {
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    try { setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || ""); } catch {}
    const sync = () => {
      try { setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || ""); } catch {}
    };
    window.addEventListener("cc:org-changed", sync);
    return () => window.removeEventListener("cc:org-changed", sync);
  }, []);

  if (!orgName) return null;

  return (
    <div style={{
      padding: "0 16px 14px",
      borderBottom: "1px solid var(--line, rgba(255,255,255,0.08))",
      marginBottom: 8,
    }}>
      <div style={{
        fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.07em", color: "var(--muted, #94adc8)", marginBottom: 3,
      }}>
        Workspace
      </div>
      <div style={{
        fontSize: "0.82rem", fontWeight: 600, color: "var(--ink, #e2eef9)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {orgName}
      </div>
    </div>
  );
}
