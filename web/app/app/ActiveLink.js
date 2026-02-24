"use client";

// usePathname() is synchronous in Next.js 14 — it does NOT need a Suspense
// boundary. Adding Suspense creates a server/client mismatch: the server
// renders ActiveLinkInner (with active-state inline styles) but during
// hydration React may render the LinkFallback (different styles) → React
// #418 → recovery → HierarchyRequestError → blank page.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ActiveLink({ href, exact, icon, label }) {
  const pathname = usePathname();
  const active = pathname
    ? (exact ? pathname === href : pathname.startsWith(href))
    : false;

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
