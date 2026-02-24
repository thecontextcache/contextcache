"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/app",          icon: "⬡",  label: "Dashboard",     exact: true },
  { href: "/app/api-keys", icon: "🔑", label: "API Keys" },
  { href: "/app/orgs",     icon: "🏢", label: "Organisation" },
];

function AppSidebar({ orgName }) {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      borderRight: "1px solid var(--line)",
      display: "flex", flexDirection: "column",
      paddingTop: 24, paddingBottom: 24,
      background: "var(--bg)",
      position: "sticky", top: 0, height: "100vh", overflowY: "auto",
    }}>
      {/* Org badge */}
      {orgName && (
        <div style={{
          padding: "0 20px 20px",
          borderBottom: "1px solid var(--line)",
          marginBottom: 12,
        }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Workspace
          </div>
          <div style={{
            fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {orgName}
          </div>
        </div>
      )}

      <nav style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ href, icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                textDecoration: "none",
                fontSize: "0.88rem", fontWeight: active ? 600 : 400,
                color: active ? "var(--ink)" : "var(--muted)",
                background: active ? "var(--panel-2)" : "transparent",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <span style={{ fontSize: "1rem", width: 20, textAlign: "center" }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function AppLayout({ children }) {
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("CONTEXTCACHE_ORG_NAME");
    if (stored) setOrgName(stored);
    // Keep in sync when org changes
    const handler = () => setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || "");
    window.addEventListener("cc:org-changed", handler);
    return () => window.removeEventListener("cc:org-changed", handler);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AppSidebar orgName={orgName} />
      <div style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
