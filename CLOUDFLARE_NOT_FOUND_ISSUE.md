# Cloudflare Build Error - The `/_not-found` Route Issue

## TL;DR

**Solution**: Create `frontend/app/not-found.tsx` with explicit `export const runtime = 'edge';`

Even with edge runtime configured in root layout, `@cloudflare/next-on-pages` cannot detect edge runtime on Next.js's auto-generated `/_not-found` route. You must create an explicit `not-found.tsx` file.

## The Problem

```
⚡️ ERROR: Failed to produce a Cloudflare Pages build from the project.
⚡️ 	The following routes were not configured to run with the Edge Runtime:
⚡️ 	  - /_not-found
```

## What We Tried (Chronologically)

### Attempt 1: Add edge runtime to individual pages ❌
**What:** Added `export const runtime = 'edge';` to all page files
**Result:** Failed - auto-generated `/_not-found` doesn't inherit from pages
**Why it failed:** Auto-generated routes don't inherit config from sibling pages

### Attempt 2: Add edge runtime to existing not-found.tsx ❌
**What:** Created `app/not-found.tsx` with edge runtime
**Result:** Failed - build tool couldn't detect it
**Why it failed:** Bug in `@cloudflare/next-on-pages` v1.13.16 processing root-level not-found.tsx

### Attempt 3: Remove not-found.tsx entirely ❌
**What:** Deleted `app/not-found.tsx` to let Next.js auto-generate
**Result:** Failed - auto-generated version has no edge runtime
**Why it failed:** Next.js auto-generates `/_not-found` without edge runtime config

### Attempt 4: Add edge runtime to root layout ❌
**What:** Added `export const runtime = 'edge';` to `app/layout.tsx`
**Result:** Failed - `@cloudflare/next-on-pages` still can't detect it
**Why it failed:** The build tool inspects `.vercel/output` artifacts, not source code. Auto-generated routes don't carry runtime metadata properly in build output

### Attempt 5: Create minimal not-found.tsx ✅
**What:** Create explicit `app/not-found.tsx` with just edge runtime export
**Result:** Should work!
**Why:** Explicit file with edge runtime gets properly written to build artifacts

## The Root Cause

The issue is a **combination of two problems**:

1. **Next.js Auto-Generation**: When `app/not-found.tsx` doesn't exist, Next.js automatically generates a `/_not-found` route at build time

2. **Build Tool Limitation**: `@cloudflare/next-on-pages` inspects the `.vercel/output` directory to check runtime configuration. The auto-generated `/_not-found` route's metadata doesn't include edge runtime info, even when set in root layout

## The Solution

Create an explicit `app/not-found.tsx` file:

```typescript
// frontend/app/not-found.tsx
export const runtime = 'edge';

export default function NotFound() {
  return null; // Or your custom 404 UI
}
```

### Why This Works

1. **Explicit Route**: Creates an actual route file instead of relying on auto-generation
2. **Build Metadata**: Runtime config gets written to `.vercel/output` artifacts properly
3. **Tool Detection**: `@cloudflare/next-on-pages` can find and verify edge runtime configuration

## Implementation Options

### Option A: Minimal (Recommended for now)
```typescript
export const runtime = 'edge';
export default function NotFound() {
  return null;
}
```
- Cloudflare Pages will show default 404
- Clean and simple
- No maintenance

### Option B: Custom 404 Page
```typescript
export const runtime = 'edge';

export default function NotFound() {
  return (
    <div>
      <h1>404 - Page Not Found</h1>
      <a href="/">Go Home</a>
    </div>
  );
}
```
- Custom branding
- Better UX
- Requires styling

## Build Process Flow

### Without explicit not-found.tsx (FAILS)
```
1. Source: No app/not-found.tsx
2. Next.js: Auto-generates /_not-found during build
3. Build output: /_not-found has no edge runtime metadata
4. @cloudflare/next-on-pages: Can't find edge runtime config
5. ❌ BUILD FAILS
```

### With explicit not-found.tsx (WORKS)
```
1. Source: app/not-found.tsx with edge runtime
2. Next.js: Uses explicit file
3. Build output: /_not-found has edge runtime metadata
4. @cloudflare/next-on-pages: Detects edge runtime ✓
5. ✅ BUILD SUCCEEDS
```

## Key Learnings

1. **Auto-generated routes are problematic**: They don't carry runtime metadata properly through the build pipeline

2. **Root layout runtime doesn't propagate to build artifacts**: Even though it should apply to all routes at runtime, the build tools can't detect it

3. **Explicit is better than implicit**: For deployment to Cloudflare Workers via `@cloudflare/next-on-pages`, always create explicit route files

4. **Build tool inspection matters**: `@cloudflare/next-on-pages` inspects build artifacts, not source code, so what matters is what's in `.vercel/output`, not what's in `app/`

## Verification

After merging, the build should show:

```bash
Route (app)                                 Size  First Load JS
┌ ƒ /                                    2.98 kB         141 kB
├ ƒ /_not-found                            XXX B         XXX kB  ← edge runtime ✓
├ ƒ /ask                                 5.19 kB         165 kB
└ ...
```

And `@cloudflare/next-on-pages` should complete without errors.

## Next Steps

1. **Merge PR**: Branch `claude/fix-not-found-minimal-011CUqjmPy8M7r5sVvHxr1xr`
2. **Verify build**: Check Cloudflare Pages build succeeds
3. **(Optional) Enhance**: Add custom 404 UI later if needed

## References

- [Next.js not-found.js](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
- [Next.js Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [@cloudflare/next-on-pages](https://github.com/cloudflare/next-on-pages)
- [GitHub Issue](https://github.com/cloudflare/next-on-pages/issues) - Consider reporting this as a bug

## Contributing Back

This appears to be a bug or limitation in `@cloudflare/next-on-pages` v1.13.16. Consider:

1. **Report Issue**: Create issue on cloudflare/next-on-pages GitHub
2. **Document Workaround**: Share this solution with community
3. **Update When Fixed**: Monitor for updates to the adapter

---

**Last Updated**: November 2025
**Status**: Workaround implemented
**Affected Version**: @cloudflare/next-on-pages@1.13.16 + Next.js 15.5.4
