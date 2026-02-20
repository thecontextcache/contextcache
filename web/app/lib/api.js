"use client";

/**
 * API base resolution.
 *
 * All browser traffic goes to the same-origin /api prefix.
 * next.config.js rewrites /api/:path* → http://api:8000/:path* server-side.
 * This means:
 *   - No CORS — browser never calls port 8000 directly
 *   - Works identically on Tailscale, Cloudflare, and local dev
 *   - NEXT_PUBLIC_API_BASE_URL can still override for edge deployments
 */
export function buildApiBase() {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (!configured) {
    return "/api";
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const prodDomain =
      host === "thecontextcache.com" || host.endsWith(".thecontextcache.com");
    const lowerConfigured = configured.toLowerCase();
    // Guardrail: if production host is in use but API base points to localhost,
    // force same-origin proxy path to avoid browser-side network/CORS failures.
    if (
      prodDomain &&
      (lowerConfigured.includes("localhost") || lowerConfigured.includes("127.0.0.1"))
    ) {
      return "/api";
    }
  }
  return configured.replace(/\/$/, "");
}

function getStoredOrgId() {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem("CONTEXTCACHE_ORG_ID") || "").trim();
}

/**
 * Docs base URL.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_DOCS_URL env var (explicit override — set this in production)
 * 2. Auto-detect from window.location:
 *    - https://thecontextcache.com  → https://docs.thecontextcache.com
 *    - any other https subdomain    → https://docs.thecontextcache.com
 *    - Tailscale / local dev        → http://<host>:8001
 */
const PRODUCTION_DOMAIN = "thecontextcache.com";

export function buildDocsBase() {
  if (process.env.NEXT_PUBLIC_DOCS_URL) {
    return process.env.NEXT_PUBLIC_DOCS_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (
      protocol === "https:" &&
      (hostname === PRODUCTION_DOMAIN || hostname.endsWith(`.${PRODUCTION_DOMAIN}`))
    ) {
      // With subdomain deployment, docs live at docs.thecontextcache.com
      return `https://docs.${PRODUCTION_DOMAIN}`;
    }
    // Tailscale / local: open docs on :8001 of the same host
    return `${protocol}//${hostname}:8001`;
  }
  return "http://localhost:8001";
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
  const primaryBase = buildApiBase();
  const bases = primaryBase === "/api" ? [primaryBase] : [primaryBase, "/api"];
  const shouldAttachOrgHeader =
    !path.startsWith("/auth/") &&
    path !== "/health" &&
    path !== "/me/orgs";
  const storedOrgId = shouldAttachOrgHeader ? getStoredOrgId() : "";
  let response;
  let networkFailureCount = 0;
  const requestInit = { ...init };
  const customHeaders = requestInit.headers || {};
  delete requestInit.headers;

  for (const base of bases) {
    try {
      response = await fetch(`${base}${path}`, {
        ...requestInit,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(storedOrgId ? { "X-Org-Id": storedOrgId } : {}),
          ...customHeaders,
        },
      });
      break;
    } catch {
      networkFailureCount += 1;
      if (networkFailureCount >= bases.length) {
        throw new ApiError(
          "Cannot reach the backend. Check your network or server status.",
          0,
          "network"
        );
      }
    }
  }

  if (!response) {
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
      throw new ApiError(
        "Server error. Please try again shortly.",
        response.status,
        "server"
      );
    throw new ApiError(detail, response.status, "client");
  }

  return body;
}

// AbortSignal.timeout is not available in Firefox ESR, Tor Browser, or Safari < 15.4.
// Fall back to a manual AbortController + setTimeout when unavailable.
function makeTimeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function checkHealth(signal) {
  const primaryBase = buildApiBase();
  const bases = primaryBase === "/api" ? [primaryBase] : [primaryBase, "/api"];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/health`, {
        credentials: "include",
        signal: signal ?? makeTimeoutSignal(5000),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}
