# Cloudflare Pages Setup for OpenNext

## The Issue

Cloudflare Pages is looking for output in `frontend/.vercel/output/static`, but OpenNext Cloudflare generates a Worker bundle in `.open-next/`.

This error occurs:
```
Error: Output directory "frontend/.vercel/output/static" not found.
Failed: build output directory not found
```

## Solution: Configure Cloudflare Pages for Worker Deployment

Cloudflare Pages supports deploying Workers through its build system. Here's how to configure it:

### Step 1: Update Cloudflare Pages Build Settings

In your Cloudflare Pages dashboard → **Settings → Builds & deployments**:

1. **Framework preset**: None (or Custom)
2. **Build command**:
   ```
   cd frontend && pnpm install && pnpm run build:cloudflare
   ```
3. **Build output directory**: Leave empty or set to `/` (Worker deployments don't use this)
4. **Root directory**: `/` (or `/frontend` if your Pages project is in a subdirectory)

### Step 2: Enable Workers/Functions Mode

Cloudflare Pages needs to know this is a Worker deployment, not a static site:

#### Option A: Automatic Detection
Cloudflare Pages should automatically detect the `wrangler.toml` file and switch to Workers mode.

#### Option B: Manual Configuration
If automatic detection doesn't work:
1. Go to your Pages project
2. Settings → Functions
3. Ensure the project is configured to use Functions/Workers

### Step 3: Configure Environment Variables

In Cloudflare Pages dashboard → **Settings → Environment Variables**, add:

**Production + Preview:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_API_URL=https://api.contextcache.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_EXPORT=true
NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true
```

### Step 4: Verify wrangler.toml

Ensure `frontend/wrangler.toml` has the correct configuration:

```toml
name = "contextcache-frontend"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

**Important**: Do NOT use `pages_build_output_dir` - that's for the old Vercel adapter.

## Alternative: Direct Wrangler Deployment

If Cloudflare Pages auto-deployment continues to have issues, deploy directly using Wrangler:

```bash
# 1. Install Wrangler globally
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Build the application
cd frontend
pnpm run build:cloudflare

# 4. Deploy
wrangler deploy
```

This bypasses Cloudflare Pages and deploys directly to Cloudflare Workers.

## Debugging

### Check Build Logs
If the build fails, check the Cloudflare Pages build logs for:
- ✓ Should show "OpenNext build complete"
- ✓ Should show "Worker saved in `.open-next/worker.js` 🚀"
- ✗ Should NOT show errors about missing `.vercel/output/static`

### Verify Output Structure
After a successful build, `.open-next/` should contain:
```
.open-next/
├── worker.js           # Main Worker entry point
├── assets/             # Static assets (images, CSS, JS)
├── server-functions/   # Server-side rendering functions
├── middleware/         # Next.js middleware
└── cloudflare/         # Cloudflare-specific initialization
```

### Common Issues

1. **"Output directory not found"**
   - Remove `pages_build_output_dir` from wrangler.toml
   - Ensure `main = ".open-next/worker.js"` is set
   - Verify the build completes successfully

2. **"nodejs_compat flag required"**
   - Add `compatibility_flags = ["nodejs_compat"]` to wrangler.toml
   - Set compatibility_date to `2024-09-23` or later

3. **Environment variables not available**
   - Set in Cloudflare dashboard, not in code
   - Apply to both Production AND Preview environments
   - Restart deployment after adding new vars

## Technical Background

### Why OpenNext Cloudflare is Different

**Old Adapter** (`@cloudflare/next-on-pages`):
- Generated static files + edge functions
- Output to `.vercel/output/static`
- Required `export const runtime = 'edge'` on all pages
- Used `pages_build_output_dir` in wrangler.toml

**New Adapter** (`@opennextjs/cloudflare`):
- Generates a complete Worker bundle
- Output to `.open-next/worker.js`
- Does NOT use edge runtime (handles transformation internally)
- Uses `main` + `assets` in wrangler.toml

### Migration Impact

When the project switched from the old adapter to OpenNext (commit bea0d78):
- The wrangler.toml configuration became outdated
- Edge runtime exports were no longer needed (but not removed)
- Output directory changed but config wasn't updated

This is why we're fixing:
1. Removing edge runtime from layout.tsx
2. Updating wrangler.toml to point to `.open-next/worker.js`
3. Using `force-dynamic` to prevent prerendering issues with Clerk

## Need Help?

- OpenNext Docs: https://opennext.js.org/cloudflare
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
