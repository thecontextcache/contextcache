"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./theme-provider";
import { buildApiBase, buildDocsBase, checkHealth, apiFetch } from "./lib/api";
import { ServiceUnavailable } from "./components/service-unavailable";

export default function Shell({ children }) {
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [hasMounted, setHasMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [healthOk, setHealthOk] = useState(true);
  const [session, setSession] = useState(null);

  const apiBase = useMemo(() => buildApiBase(), []);
  const [docsBase, setDocsBase] = useState("");

  useEffect(() => {
    setHasMounted(true);
    setDocsBase(buildDocsBase());
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    let cancelled = false;
    async function probe() {
      const ok = await checkHealth();
      if (!cancelled) setHealthOk(ok);
    }
    probe();
    return () => { cancelled = true; };
  }, [hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;
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
  }, [hasMounted, pathname]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch { /* proceed */ }
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

  return (
    <div className="shell">
      {hasMounted && healthOk === false && (
        <ServiceUnavailable
          onRecover={() => {
            setHealthOk(true);
            router.refresh();
          }}
        />
      )}

      <header className="topbar">
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
          {hasMounted && !onAuthPage && isLoggedIn && <Link href="/brain" className={nav("/brain")}>Brain</Link>}
          {hasMounted && !onAuthPage && isAdmin && <Link href="/admin" className={nav("/admin")}>Admin</Link>}
          {hasMounted && !onAuthPage && isLoggedIn ? (
            <button type="button" className="nav-btn" onClick={logout}>Sign out</button>
          ) : hasMounted && !onAuthPage && !isLoggedIn ? (
            <Link href="/auth" className={nav("/auth")}>Sign in</Link>
          ) : !hasMounted && !onAuthPage ? (
            <Link href="/auth" className={nav("/auth")}>Sign in</Link>
          ) : null}
        </nav>
      </header>

      <main id="main-content" className={`page-transition-wrap ${isFullWidth ? "" : "page"}`}>
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
        </div>
      </footer>
    </div>
  );
}
