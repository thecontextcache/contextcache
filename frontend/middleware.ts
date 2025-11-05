// middleware.ts
//
// ⚠️ IMPORTANT: This middleware does NOT run with static export (output: 'export')
// With static export, authentication is handled CLIENT-SIDE ONLY by Clerk's React components
// Protected routes are enforced by:
//   1. Clerk's <SignedIn>/<SignedOut> components in layouts
//   2. Client-side redirects in page components
//   3. Clerk's useAuth() hook checks
//
// For server-side protection, deploy to Vercel or use @cloudflare/next-on-pages
//
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define protected routes (for reference only - won't enforce with static export)
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
  // Protect specific routes (ONLY works with SSR, not static export)
  if (isProtectedRoute(req)) {
    await auth.protect();
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