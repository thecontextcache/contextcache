"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/app",          icon: "⬡",  label: "Dashboard",  exact: true },
  { href: "/app/api-keys", icon: "🔑", label: "API Keys" },
  { href: "/app/orgs",     icon: "🏢", label: "Organisation" },
];

// Isolated into its own component so it can be Suspense-wrapped safely.
// usePathname() must be inside Suspense in Next.js 14 client layouts.
function NavLinks() {
  const pathname = usePathname();
  return (
    <>
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
              fontSize: "0.88rem",
              fontWeight: active ? 600 : 400,
              color: active ? "var(--ink)" : "var(--muted)",
              background: active ? "var(--panel-2, rgba(255,255,255,0.06))" : "transparent",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <span style={{ fontSize: "1rem", width: 20, textAlign: "center", flexShrink: 0 }}>
              {icon}
            </span>
            {label}
          </Link>
        );
      })}
    </>
  );
}

// Fallback nav rendered while Suspense resolves (no active highlighting).
function NavLinksFallback() {
  return (
    <>
      {NAV_ITEMS.map(({ href, icon, label }) => (
        <Link
          key={href}
          href={href}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 8,
            textDecoration: "none",
            fontSize: "0.88rem", fontWeight: 400,
            color: "var(--muted)",
          }}
        >
          <span style={{ fontSize: "1rem", width: 20, textAlign: "center", flexShrink: 0 }}>
            {icon}
          </span>
          {label}
        </Link>
      ))}
    </>
  );
}

export default function AppLayout({ children }) {
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("CONTEXTCACHE_ORG_NAME");
      if (stored) setOrgName(stored);
    } catch { /* localStorage blocked in some contexts */ }

    const handler = () => {
      try {
        setOrgName(localStorage.getItem("CONTEXTCACHE_ORG_NAME") || "");
      } catch { /* ignore */ }
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
            padding: "0 16px 16px",
            borderBottom: "1px solid var(--line, rgba(255,255,255,0.08))",
            marginBottom: 10,
          }}>
            <div style={{
              fontSize: "0.65rem", fontWeight: 700,
              color: "var(--muted)", textTransform: "uppercase",
              letterSpacing: "0.06em", marginBottom: 3,
            }}>
              Workspace
            </div>
            <div style={{
              fontSize: "0.82rem", fontWeight: 600, color: "var(--ink)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {orgName}
            </div>
          </div>
        )}

        <nav style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
      </aside>

      {/* Page content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
