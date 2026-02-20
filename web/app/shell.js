"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

  const apiBase = useMemo(() => buildApiBase(), []);
  // Docs URL is client-only — buildDocsBase() needs window.location.hostname.
  // useEffect ensures it never runs on the server (avoids SSR → localhost:8001).
  const [docsBase, setDocsBase] = useState("");

  useEffect(() => {
    setDocsBase(buildDocsBase());
  }, []);

  // Health check on mount, retry when recovered
  useEffect(() => {
    let mounted = true;
    async function probe() {
      const ok = await checkHealth();
      if (mounted) setHealthOk(ok);
    }
    probe();
    return () => { mounted = false; };
  }, []);

  // Auth probe — only on protected pages
  const isPublicPage = pathname === "/" || pathname.startsWith("/auth") || pathname.startsWith("/legal") || pathname.startsWith("/waitlist") || pathname === "/pricing";
  useEffect(() => {
    if (isPublicPage) return;
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
  }, [apiBase, isPublicPage, pathname]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Proceed even if logout endpoint fails.
    }
    setIsLoggedIn(false);
    setIsAdmin(false);
    setSession(null);
    router.push("/auth");
  }

  function nav(href) {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return `nav-link${active ? " active" : ""}`;
  }

  // Don't show login-state nav items on the auth page itself —
  // the user is mid-signin and "Sign out" / "Admin" make no sense there.
  const onAuthPage = pathname.startsWith("/auth");

  if (healthOk === false) {
    return (
      <ServiceUnavailable
        onRecover={() => {
          setHealthOk(true);
          router.refresh();
        }}
      />
    );
  }

  // Landing page and pricing are full-width — they handle their own layout.
  const isFullWidth = pathname === "/" || pathname === "/pricing";

  return (
    <div className="shell">
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
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          >
            {resolvedTheme === "dark" ? "☀" : "☾"}
          </button>
        </nav>
      </header>

      {isFullWidth ? (
        <main id="main-content" className="page-transition-wrap">{children}</main>
      ) : (
        <div className="page page-transition-wrap" id="main-content">{children}</div>
      )}

      <footer className="footer">
        <span className="muted">thecontextcache™ — invite-only alpha</span>

        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
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
