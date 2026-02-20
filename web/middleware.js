import { NextResponse } from "next/server";

const SESSION_COOKIE = "contextcache_session";

// Routes that require an authenticated session
const AUTH_REQUIRED = ["/app", "/admin", "/brain"];
// Only root redirects when a session cookie exists.
// Keep /auth accessible to avoid redirect loops when a stale cookie exists.
const AUTHED_REDIRECT = [];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

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
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/auth", "/app/:path*", "/admin/:path*", "/brain/:path*"],
};
