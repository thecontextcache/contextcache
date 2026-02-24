"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// No usePathname() here. Active state is detected client-side only (after mount)
// using window.location.pathname. This guarantees server HTML === client HTML
// during hydration, eliminating React error #418 (hydration mismatch).
const NAV_ITEMS = [
  { href: "/app",          icon: "⬡",  label: "Dashboard",    exact: true },
  { href: "/app/api-keys", icon: "🔑", label: "API Keys" },
  { href: "/app/orgs",     icon: "🏢", label: "Organisation" },
];

export default function AppLayout({ children }) {
  // Both start empty so server HTML matches client HTML at hydration time.
  const [pathname, setPathname] = useState("");
  const [orgName,  setOrgName]  = useState("");

  useEffect(() => {
    // Set pathname after mount — no SSR involvement, no hydration conflict.
    setPathname(window.location.pathname);
    // Keep in sync when Next.js does client-side navigation.
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    try { setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || ""); } catch {}
    const handler = () => {
      try { setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || ""); } catch {}
    };
    window.addEventListener("cc:org-changed", handler);
    return () => window.removeEventListener("cc:org-changed", handler);
  }, []);

  return (
    <div style={{ display: "flex", width: "100%" }}>
      {/* Sidebar */}
      <aside style={{
        width: 200,
        flexShrink: 0,
        borderRight: "1px solid var(--line, rgba(255,255,255,0.08))",
        display: "flex",
        flexDirection: "column",
        paddingTop: 20,
        paddingBottom: 20,
      }}>
        {orgName && (
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
              fontSize: "0.82rem", fontWeight: 600,
              color: "var(--ink, #e2eef9)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {orgName}
            </div>
          </div>
        )}

        <nav style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(({ href, icon, label, exact }) => {
            const active = pathname
              ? (exact ? pathname === href : pathname.startsWith(href))
              : false;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  textDecoration: "none",
                  fontSize: "0.88rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--ink, #e2eef9)" : "var(--muted, #94adc8)",
                  background: active ? "var(--panel-2, rgba(255,255,255,0.06))" : "transparent",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <span style={{ width: 20, textAlign: "center", flexShrink: 0, fontSize: "1rem" }}>
                  {icon}
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Page content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
