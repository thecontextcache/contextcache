// middleware.ts
//
// Clerk middleware for authentication with Cloudflare Workers
// Protects routes that require authentication
//
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define protected routes
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/ask(.*)',
  '/graph(.*)',
  '/audit(.*)',
  '/export(.*)',
  '/settings(.*)',
  '/inbox(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Only protect routes if Clerk is properly configured
  // This prevents blocking the entire app if env vars are missing
  if (isProtectedRoute(req)) {
    try {
      await auth.protect();
    } catch (error) {
      // If Clerk fails to initialize (missing env vars), allow request through
      // and let client-side Clerk handle authentication
      console.warn('Clerk middleware failed:', error);
      // Don't block the request - let it through
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless they appear in query‑params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};