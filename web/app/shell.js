"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./theme-provider";
import { buildApiBase, buildDocsBase, checkHealth, apiFetch } from "./lib/api";
import { ServiceUnavailable } from "./components/service-unavailable";
import { DebugPanel } from "./components/debug-panel";

export default function Shell({ children }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [healthOk, setHealthOk] = useState(null);
  const [lastError, setLastError] = useState("");
  const [session, setSession] = useState(null);

  // Mount guard: never swap the render tree until after React has hydrated.
  // Without this, healthOk can flip to false before hydration finishes,
  // causing SSR (renders children) vs CSR (renders ServiceUnavailable)
  // mismatch → React #418 → #423 → HierarchyRequestError → white screen.
  const hasMounted = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    hasMounted.current = true;
    setMounted(true);
  }, []);

  const apiBase = useMemo(() => buildApiBase(), []);
  const [docsBase, setDocsBase] = useState("");

  useEffect(() => {
    setDocsBase(buildDocsBase());
  }, []);

  // Health check on mount, retry when recovered
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      const ok = await checkHealth();
      if (!cancelled) setHealthOk(ok);
    }
    probe();
    return () => { cancelled = true; };
  }, []);

  // Auth probe — run globally to keep the topbar perfectly in sync
  useEffect(() => {
    async function checkMe() {
      try {
        const me = await apiFetch("/auth/me");
        setIsLoggedIn(true);
        setIsAdmin(Boolean(me.is_admin));
        setSession(me);
      } catch {
        setIsLoggedIn(false);
        setIsAdmin(false);
      }
    }
    checkMe();
  }, [apiBase, pathname]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Proceed even if logout endpoint fails.
    }
    setIsLoggedIn(false);
    setIsAdmin(false);
    setSession(null);
    window.location.href = "/auth";
  }

  function nav(href) {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return `nav-link${active ? " active" : ""}`;
  }

  const onAuthPage = pathname.startsWith("/auth");

  const isFullWidth = pathname === "/" || pathname === "/pricing";

  // ServiceUnavailable renders as a fixed overlay on TOP of children so the
  // React tree structure is identical on server and client during hydration.
  const showUnavailable = mounted && healthOk === false;

  return (
    <div className="shell">
      {showUnavailable && (
        <ServiceUnavailable
          onRecover={() => {
            setHealthOk(true);
            router.refresh();
          }}
        />
      )}
      <header className="topbar">
        {/* Hard navigate: bypasses Next.js client router cache so middleware
            always runs and redirects auth users correctly to /app */}
        <a href="/" className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="img" focusable="false">
              <defs>
                <linearGradient id="cc-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="currentColor" />
                  <stop offset="100%" stopColor="#7C3AFF" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="none" stroke="url(#cc-logo-gradient)" strokeWidth="2.4" />
              <path d="M21.5 10.7a7.5 7.5 0 1 0 0 10.6" fill="none" stroke="url(#cc-logo-gradient)" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="22.6" cy="9.4" r="1.7" fill="currentColor" />
              <circle cx="22.6" cy="22.6" r="1.7" fill="#7C3AFF" />
            </svg>
          </span>
          <span>thecontextcache™</span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <Link href="/pricing" className={nav("/pricing")}>Pricing</Link>
          <Link href="/clients" className={nav("/clients")}>Clients</Link>
          <Link href="/app" className={nav("/app")}>App</Link>
          {!onAuthPage && isLoggedIn && <Link href="/brain" className={nav("/brain")}>Brain</Link>}
          {!onAuthPage && isAdmin && <Link href="/admin" className={nav("/admin")}>Admin</Link>}
          {!onAuthPage && isLoggedIn ? (
            <button type="button" className="nav-btn" onClick={logout}>
              Sign out
            </button>
          ) : !onAuthPage && !isLoggedIn ? (
            <Link href="/auth" className={nav("/auth")}>Sign in</Link>
          ) : null}
        </nav>
      </header>

      <main
        id="main-content"
        className={`page-transition-wrap ${isFullWidth ? "" : "page"}`}
      >
        {children}
      </main>

      <footer className="footer">
        <span className="muted">thecontextcache™ — invite-only alpha</span>

        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/clients">Clients</Link>
          {docsBase && <a href={docsBase} target="_blank" rel="noreferrer">Docs</a>}
          <a href="mailto:support@thecontextcache.com">Support</a>
          <Link href="/legal">Legal</Link>

          {/* Divider */}
          <span style={{ color: "var(--muted-2)", userSelect: "none" }}>·</span>

          {/* Bluesky */}
          <a
            href="https://bsky.app/profile/thecontextcache.bsky.social"
            target="_blank"
            rel="noreferrer"
            className="footer-social"
            aria-label="TheContextCache on Bluesky"
            title="@thecontextcache.bsky.social on Bluesky"
          >
            <svg width="14" height="14" viewBox="0 0 360 320" fill="currentColor" aria-hidden="true">
              <path d="M180 142c-16-70-80-120-140-120C15 22 0 60 0 80c0 52 40 70 80 80-50 10-80 40-80 80 0 30 20 60 60 60 50 0 100-40 120-80 20 40 70 80 120 80 40 0 60-30 60-60 0-40-30-70-80-80 40-10 80-28 80-80C360 60 345 22 320 22c-60 0-124 50-140 120z" />
            </svg>
            Bluesky
          </a>

          {/* Instagram */}
          <a
            href="https://www.instagram.com/thecontextcache"
            target="_blank"
            rel="noreferrer"
            className="footer-social"
            aria-label="TheContextCache on Instagram"
            title="@thecontextcache on Instagram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            Instagram
          </a>
        </div>
      </footer>

      <DebugPanel healthOk={healthOk} lastError={lastError} session={session} />
    </div>
  );
}
