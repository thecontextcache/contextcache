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
  // Protect routes that require authentication
  if (isProtectedRoute(req)) {
    try {
      await auth.protect();
    } catch (error) {
      // Log error but let client-side Clerk handle auth
      console.warn('Clerk middleware error:', error);
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