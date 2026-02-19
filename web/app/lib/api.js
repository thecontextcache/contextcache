"use client";

export function buildApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export function buildDocsBase() {
  if (process.env.NEXT_PUBLIC_DOCS_URL) {
    return process.env.NEXT_PUBLIC_DOCS_URL.replace(/\/$/, "");
  }
  if (typeof window === "undefined") return "http://localhost:8001";
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
      "Cannot reach the backend. Check your network and server status.",
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
        "Too many requests. Please wait a moment and try again.",
        429,
        "rate_limit"
      );
    if (response.status >= 500)
      throw new ApiError(
        "Server error. Our team has been notified.",
        response.status,
        "server"
      );
    throw new ApiError(detail, response.status, "client");
  }

  return body;
}

export async function checkHealth(signal) {
  const base = buildApiBase();
  try {
    const res = await fetch(`${base}/health`, {
      signal: signal ?? AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
