import { NextResponse } from "next/server";

// We read from env, but if the .env wasn't fully piped to the Next.js container,
// we dynamically scan the cookies for the 64-character hex session token.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "contextcache_session";

// Routes that require an authenticated session
const AUTH_REQUIRED = ["/app", "/admin", "/brain"];
// Only root redirects when a session cookie exists.
// Keep /auth accessible to avoid redirect loops when a stale cookie exists.
const AUTHED_REDIRECT = [];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Primary exact match (works natively if SESSION_COOKIE is kept at default)
  let hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Fallback heuristic: If name overriding happened in the backend but the env var
  // didn't arrive here, scan for ANY cookie containing a 64-character hex token 
  // (the native format of our auth sessions: os.urandom(32).hex()).
  if (!hasSession) {
    const all = request.cookies.getAll();
    const fallback = all.find(c => /^[0-9a-f]{64}$/i.test(c.value));
    hasSession = Boolean(fallback);
  }

  // Authenticated users on landing/auth pages → send to /app
  if (AUTHED_REDIRECT.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  // Protected routes without a session → send to /auth
  const needsAuth = AUTH_REQUIRED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/auth", "/app/:path*", "/admin/:path*", "/brain/:path*"],
};
