import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'contextcache_session';
const AUTH_REQUIRED = ['/app', '/admin', '/brain'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const needsAuth = AUTH_REQUIRED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (needsAuth && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*', '/brain/:path*'],
};
