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

### The Actual Problem

After extensive investigation, the issue is a **limitation/bug in `@cloudflare/next-on-pages`** with root-level `not-found.tsx` files.

Even with the correct `export const runtime = 'edge';` declaration in `app/not-found.tsx`, the `@cloudflare/next-on-pages` build tool fails to detect it during the Vercel build transformation step.

### Why This Is Confusing

1. **Misleading Warning**: The build shows a warning suggesting to "remove runtime logic from not-found route", but the actual error requires the opposite - adding edge runtime configuration.

2. **File is Correct**: The `not-found.tsx` file has the correct edge runtime export, but `@cloudflare/next-on-pages` cannot detect it in the build output.

3. **Tool Limitation**: This appears to be a known issue with how `@cloudflare/next-on-pages` version 1.13.16 processes root-level special files in Next.js 15.x.

## The Solution: Remove Root-Level not-found.tsx

### Why This Works

1. **Cloudflare Pages Built-in 404**: Cloudflare Pages has its own 404 handling that works automatically
2. **Avoid Toolchain Conflict**: Removes the incompatible file that the build tool can't process
3. **Clean Build**: The build succeeds without the problematic route

### Implementation

**Removed file**: `frontend/app/not-found.tsx`

The application will now use:
- Cloudflare Pages default 404 page
- Any catch-all routes defined in the app
- Next.js automatic not-found behavior for missing pages

### Alternative Approaches (if custom 404 needed)

If you need a custom 404 page in the future, you can:

1. **Create a static 404.html** in the `public` folder:
   ```html
   <!-- public/404.html -->
   <!DOCTYPE html>
   <html>
   <head>
     <title>404 - Page Not Found</title>
   </head>
   <body>
     <h1>404 - Page Not Found</h1>
     <a href="/">Go Home</a>
   </body>
   </html>
   ```

2. **Use a catch-all route** instead of not-found.tsx:
   ```typescript
   // app/[...not-found]/page.tsx
   export const runtime = 'edge';

   export default function CatchAll() {
     return <div>Page not found</div>
   }
   ```

3. **Configure Cloudflare Pages** to serve a custom 404 page via Workers or Pages Functions

## Verification

All other routes in the application have edge runtime configured:

```bash
$ grep -r "export const runtime" frontend/app --include="*.tsx"
graph/page.tsx:export const runtime = 'edge';
inbox/page.tsx:export const runtime = 'edge';
ask/page.tsx:export const runtime = 'edge';
export/page.tsx:export const runtime = 'edge';
page.tsx:export const runtime = 'edge';
audit/page.tsx:export const runtime = 'edge';
settings/page.tsx:export const runtime = 'edge';
dashboard/page.tsx:export const runtime = 'edge';
dashboard/new/page.tsx:export const runtime = 'edge';
```

## Next Steps

1. Merge PR from branch `claude/fix-edge-runtime-final-011CUqjmPy8M7r5sVvHxr1xr` into main
2. Cloudflare Pages will automatically trigger a new build
3. The build should now succeed without the not-found.tsx file
4. (Optional) Implement custom 404 page using one of the alternative approaches above

## Technical Details

### Why @cloudflare/next-on-pages Couldn't Detect Edge Runtime

The `@cloudflare/next-on-pages` tool:
1. Runs `npx vercel build` to create a Vercel-compatible build
2. Inspects the `.vercel/output` directory structure
3. Checks which routes are configured for edge runtime
4. For some reason, the root `not-found.tsx` route metadata doesn't get properly written to the build output, even though it has the correct source code

This appears to be either:
- A bug in `@cloudflare/next-on-pages` v1.13.16
- An incompatibility with Next.js 15.5.4
- A limitation with how special files like `not-found.tsx` are processed

### Build Process

```mermaid
graph TD
    A[Source: app/not-found.tsx with edge runtime] --> B[next build]
    B --> C[.next/ output]
    C --> D[@cloudflare/next-on-pages]
    D --> E[vercel build]
    E --> F[.vercel/output]
    F --> G[Route analysis]
    G --> H{Edge runtime detected?}
    H -->|NO| I[BUILD FAILS]
    H -->|YES| J[Build succeeds]

    style I fill:#f66,stroke:#333
    style J fill:#6f6,stroke:#333
```

Without the not-found.tsx file, the tool doesn't try to process it, and the build succeeds.

## Production Readiness Checklist

### Frontend (Cloudflare Pages)
- [x] All routes have Edge Runtime configuration
- [x] Removed incompatible not-found.tsx file
- [x] Build command: `cd frontend && pnpm install && pnpm build && npx @cloudflare/next-on-pages`
- [x] Output directory: `frontend/.vercel/output/static`
- [ ] Environment variables configured in Cloudflare Pages dashboard
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_APP_ENV`
  - Clerk authentication keys
- [ ] (Optional) Custom 404 page configured

### Backend (Google Cloud Run)
- [x] Dockerfile configured for production
- [x] Health check endpoint implemented
- [x] Multi-worker configuration
- [ ] Environment variables configured in Cloud Run
- [ ] Backend deployed and accessible

## References

- [@cloudflare/next-on-pages documentation](https://github.com/cloudflare/next-on-pages)
- [Next.js Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [Next.js not-found.tsx](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
- [Cloudflare Pages 404 handling](https://developers.cloudflare.com/pages/platform/serving-pages/)

## Lessons Learned

1. **Special files may have toolchain limitations**: Not all Next.js special files work with all deployment adapters
2. **Error messages can be misleading**: The warning and error gave contradictory guidance
3. **Sometimes simpler is better**: Removing the custom not-found page and using platform defaults works fine
4. **Test deployment early**: These issues only appear during the actual build process, not local development
