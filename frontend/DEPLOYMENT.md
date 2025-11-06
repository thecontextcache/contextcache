# Cloudflare Deployment Guide for ContextCache Frontend

This Next.js application uses **@opennextjs/cloudflare** for deployment to Cloudflare Workers/Pages.

## Deployment Options

### Option 1: Using OpenNext CLI (Recommended)

This is the simplest method for deploying to Cloudflare:

```bash
# 1. Build the application
pnpm run build:cloudflare

# 2. Deploy to Cloudflare
pnpm run deploy:cloudflare
```

The `deploy:cloudflare` command will:
- Use your Cloudflare credentials from `wrangler login` or environment variables
- Deploy the Worker bundle from `.open-next/`
- Set up the necessary bindings and configurations

### Option 2: Using Wrangler CLI Directly

If you prefer more control over the deployment:

```bash
# 1. Build the application
pnpm run build:cloudflare

# 2. Deploy using Wrangler
npx wrangler deploy

# Or for a specific environment
npx wrangler deploy --env production
```

### Option 3: Cloudflare Pages via Git Integration

**Important**: Due to the OpenNext adapter generating a Worker bundle (not static files), Cloudflare Pages automatic deployments require specific configuration:

#### Configure in Cloudflare Pages Dashboard:

1. **Build Configuration:**
   - Build command: `cd frontend && pnpm install && pnpm run build:cloudflare`
   - Build output directory: `.open-next` (NOT `.vercel/output/static`)
   - Root directory: `/` (if repository root) or `/frontend` (if frontend subdirectory)

2. **Environment Variables:**
   Set these in **Settings → Environment Variables**:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   NEXT_PUBLIC_API_URL=https://api.contextcache.com
   NEXT_PUBLIC_APP_ENV=production
   NEXT_PUBLIC_ENABLE_ANALYTICS=false
   NEXT_PUBLIC_ENABLE_EXPORT=true
   NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true
   ```

3. **Compatibility Settings:**
   - Compatibility date: `2024-09-23` or later
   - Compatibility flags: Enable `nodejs_compat`

## Environment Variables Required

The following environment variables must be configured in Cloudflare dashboard:

### Authentication (Required)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Get from https://dashboard.clerk.com/
- `CLERK_SECRET_KEY` - Get from https://dashboard.clerk.com/

### API Configuration (Required)
- `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `https://api.contextcache.com`)
- `NEXT_PUBLIC_APP_ENV` - Environment (`development`, `staging`, or `production`)

### Feature Flags (Optional)
- `NEXT_PUBLIC_ENABLE_ANALYTICS` - Enable/disable analytics (`true`/`false`)
- `NEXT_PUBLIC_ENABLE_EXPORT` - Enable/disable export feature (`true`/`false`)
- `NEXT_PUBLIC_ENABLE_GRAPH_VIEW` - Enable/disable graph view (`true`/`false`)

## Wrangler Configuration

The `wrangler.toml` file is configured for OpenNext Cloudflare:

```toml
name = "contextcache-frontend"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

## Local Testing

Test the production build locally before deploying:

```bash
# Build the application
pnpm run build:cloudflare

# Preview with Wrangler dev server
pnpm run preview:cloudflare
```

## Troubleshooting

### Build fails with "cannot use the edge runtime"
- This has been fixed by removing edge runtime from the root layout
- All routes use `force-dynamic` rendering
- Ensure you're on the latest commit

### Deployment fails with "Output directory not found"
- Make sure `wrangler.toml` points to `.open-next/worker.js`
- Do NOT use `pages_build_output_dir` - that's for the old adapter
- Use `main` and `[assets]` configuration instead

### Environment variables not working
- Cloudflare reads env vars at runtime from the dashboard settings
- Build-time env vars must be set in Cloudflare Pages build settings
- Never commit real API keys to the repository

## Migration Notes

This project was migrated from `@cloudflare/next-on-pages` to `@opennextjs/cloudflare`. Key changes:

1. **No edge runtime exports** - OpenNext handles the Worker transformation
2. **Dynamic rendering** - All routes use `force-dynamic` to avoid prerendering issues
3. **Worker bundle output** - Generates `.open-next/` instead of `.vercel/output/`
4. **Wrangler configuration** - Uses `main` + `assets` instead of `pages_build_output_dir`

## Additional Resources

- [OpenNext Cloudflare Documentation](https://opennext.js.org/cloudflare)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Clerk Documentation](https://clerk.com/docs)
