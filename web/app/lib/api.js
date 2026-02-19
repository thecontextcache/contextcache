"use client";

// Production domain — when accessed over HTTPS from this hostname (or any
// subdomain), the frontend uses same-origin relative paths that Cloudflare
// Tunnel (or any reverse-proxy) maps to the correct backend service:
//   /api  → api:8000
//   /docs → docs:8001
const PRODUCTION_DOMAIN = "thecontextcache.com";

function isProductionDomain() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  return (
    protocol === "https:" &&
    (hostname === PRODUCTION_DOMAIN || hostname.endsWith(`.${PRODUCTION_DOMAIN}`))
  );
}

// Priority order:
// 1. NEXT_PUBLIC_API_BASE_URL (explicit override — baked in at build time)
// 2. Same-origin /api  — when on production HTTPS domain (Mode B: Cloudflare)
// 3. Same host on :8000 — Tailscale / local (Mode A)
export function buildApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }
  if (typeof window === "undefined") return "http://localhost:8000";
  if (isProductionDomain()) return "/api";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

// Same two-mode logic for the docs site.
export function buildDocsBase() {
  if (process.env.NEXT_PUBLIC_DOCS_URL) {
    return process.env.NEXT_PUBLIC_DOCS_URL.replace(/\/$/, "");
  }
  if (typeof window === "undefined") return "http://localhost:8001";
  if (isProductionDomain()) return "/docs";
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

export class ApiError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    // kind: 'network' | 'auth' | 'forbidden' | 'rate_limit' | 'server' | 'client'
    this.kind = kind;
  }
}

export async function apiFetch(path, init = {}) {
  const base = buildApiBase();
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Check your network or server status.",
      0,
      "network"
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body.detail || "Request failed";
    if (response.status === 401) throw new ApiError(detail, 401, "auth");
    if (response.status === 403) throw new ApiError(detail, 403, "forbidden");
    if (response.status === 429)
      throw new ApiError(
        "Too many requests — please wait a moment and try again.",
        429,
        "rate_limit"
      );
    if (response.status >= 500)
      throw new ApiError("Server error. Please try again shortly.", response.status, "server");
    throw new ApiError(detail, response.status, "client");
  }

  return body;
}

export async function checkHealth(signal) {
  const base = buildApiBase();
  try {
    const res = await fetch(`${base}/health`, {
      credentials: "include",
      signal: signal ?? AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
