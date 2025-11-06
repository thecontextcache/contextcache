# Cloudflare Build Error - Root Cause & Solution

## The Recurring Issue

The Cloudflare Pages build has been failing repeatedly with this error:

```
⚡️ ERROR: Failed to produce a Cloudflare Pages build from the project.
⚡️
⚡️ 	The following routes were not configured to run with the Edge Runtime:
⚡️ 	  - /_not-found
⚡️
⚡️ 	Please make sure that all your non-static routes export the following edge runtime route segment config:
⚡️ 	  export const runtime = 'edge';
```

## Root Cause Analysis

### Why This Keeps Happening

1. **Cloudflare Workers Requirement**: `@cloudflare/next-on-pages` requires ALL non-static routes to have `export const runtime = 'edge'` because Cloudflare Workers only supports Edge Runtime, NOT Node.js runtime.

2. **Misleading Warning**: The build tool shows a warning that says:
   ```
   ⚡️ Warning: your app/not-found route might contain runtime logic, this is currently
   ⚡️ not supported by @cloudflare/next-on-pages
   ```

   This warning is **misleading**! It suggests removing runtime logic, but the actual requirement is the **opposite** - you MUST add `export const runtime = 'edge'`.

3. **PR Merge Issue**: Multiple PRs were created to fix this, but PR #41 that was merged to main did NOT actually contain the fix. The branch with the correct fix (`claude/fix-cloudflare-build-error-011CUqjmPy8M7r5sVvHxr1xr`) was never merged into main.

## The Correct Fix

### File: `frontend/app/not-found.tsx`

**BEFORE (Broken):**
```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    // ... component code
  );
}
```

**AFTER (Fixed):**
```tsx
import Link from 'next/link';

export const runtime = 'edge';  // ← THIS LINE IS REQUIRED

export default function NotFound() {
  return (
    // ... component code
  );
}
```

### Why This Is Required

- Without `export const runtime = 'edge'`, Next.js defaults to Node.js runtime
- Cloudflare Workers cannot execute Node.js runtime
- The build fails during the Vercel → Cloudflare transformation step
- **ALL** non-static routes must have this declaration

## Verification

All routes in the application now have edge runtime:

```bash
$ grep -r "export const runtime" frontend/app --include="*.tsx"
graph/page.tsx:export const runtime = 'edge';
inbox/page.tsx:export const runtime = 'edge';
ask/page.tsx:export const runtime = 'edge';
export/page.tsx:export const runtime = 'edge';
page.tsx:export const runtime = 'edge';
not-found.tsx:export const runtime = 'edge';  # ← Fixed!
audit/page.tsx:export const runtime = 'edge';
settings/page.tsx:export const runtime = 'edge';
dashboard/page.tsx:export const runtime = 'edge';
dashboard/new/page.tsx:export const runtime = 'edge';
```

## Next Steps

1. Merge PR from branch `claude/fix-edge-runtime-final-011CUqjmPy8M7r5sVvHxr1xr` into main
2. Cloudflare Pages will automatically trigger a new build
3. The build should now succeed

## Backend Deployment

The backend is configured to deploy to Google Cloud Run using:
- `cloudbuild-api.yaml` - Build configuration
- `infra/api.Dockerfile` - Production-ready multi-stage Dockerfile
- FastAPI application in `api/main.py`

Backend appears production-ready with:
- ✅ Multi-stage Docker build
- ✅ Non-root user for security
- ✅ Health checks
- ✅ Proper dependency management
- ✅ Worker process configuration

## Production Readiness Checklist

### Frontend (Cloudflare Pages)
- [x] All routes have Edge Runtime configuration
- [x] Build command: `cd frontend && pnpm install && pnpm build && npx @cloudflare/next-on-pages`
- [x] Output directory: `frontend/.vercel/output/static`
- [ ] Environment variables configured in Cloudflare Pages dashboard
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_APP_ENV`
  - Clerk authentication keys

### Backend (Google Cloud Run)
- [x] Dockerfile configured for production
- [x] Health check endpoint implemented
- [x] Multi-worker configuration
- [ ] Environment variables configured in Cloud Run
  - Database connection string
  - API keys
  - Secret keys

### DNS & Domains
- [ ] Custom domain configured for frontend
- [ ] Custom domain configured for backend API
- [ ] SSL/TLS certificates configured
- [ ] CORS configured to allow frontend domain

## Preventing This Issue

**Rule**: When working with `@cloudflare/next-on-pages`, ALWAYS ensure:

1. ALL page routes have `export const runtime = 'edge';`
2. Client components (with `'use client'`) do not need this
3. The build warning about "runtime logic" can be ignored - it's checking for complex server-side logic, not the runtime export itself
4. Test the build locally before pushing: `npx @cloudflare/next-on-pages`

## References

- [@cloudflare/next-on-pages documentation](https://github.com/cloudflare/next-on-pages)
- [Next.js Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [Cloudflare Workers](https://workers.cloudflare.com/)
