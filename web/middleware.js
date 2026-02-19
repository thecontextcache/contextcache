import { NextResponse } from "next/server";

const PROTECTED_PATHS = ["/app", "/admin"];
const SESSION_COOKIE_NAME = "contextcache_session";

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const requiresAuth = PROTECTED_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!requiresAuth) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/auth";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
