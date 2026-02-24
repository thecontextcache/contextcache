"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// Isolated client component for a single nav link with active state.
// Wrapped in Suspense at the call site in layout.js so that if
// usePathname() suspends (e.g. during streaming), a fallback renders.
function ActiveLinkInner({ href, exact, icon, label }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8,
        textDecoration: "none",
        fontSize: "0.88rem",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--ink, #e2eef9)" : "var(--muted, #94adc8)",
        background: active
          ? "var(--panel-2, rgba(255,255,255,0.06))"
          : "transparent",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      <span style={{ width: 20, textAlign: "center", flexShrink: 0, fontSize: "1rem" }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

// Static fallback rendered before usePathname() resolves (no active state).
function LinkFallback({ href, icon, label }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8,
        textDecoration: "none",
        fontSize: "0.88rem", fontWeight: 400,
        color: "var(--muted, #94adc8)",
      }}
    >
      <span style={{ width: 20, textAlign: "center", flexShrink: 0, fontSize: "1rem" }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

export function ActiveLink({ href, exact, icon, label }) {
  return (
    <Suspense fallback={<LinkFallback href={href} icon={icon} label={label} />}>
      <ActiveLinkInner href={href} exact={exact} icon={icon} label={label} />
    </Suspense>
  );
}
