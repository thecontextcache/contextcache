# Deployment Guide

## Required GitHub Secrets

For the Cloudflare Workers deployment to work, you need to configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### Required Secrets

1. **`CLOUDFLARE_API_TOKEN`**
   - Get from: https://dash.cloudflare.com/profile/api-tokens
   - Required permissions: "Edit Cloudflare Workers"
   - Template: "Edit Cloudflare Workers"

2. **`CLOUDFLARE_ACCOUNT_ID`**
   - Get from: Cloudflare Dashboard URL (after selecting your site)
   - Format: `https://dash.cloudflare.com/{account_id}/...`
   - Or from: Account → Overview → Account ID (right sidebar)

3. **`CLERK_SECRET_KEY`**
   - Get from: https://dashboard.clerk.com
   - Navigate to: API Keys → Secret keys
   - Format: `sk_live_...` or `sk_test_...`

4. **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`**
   - Get from: https://dashboard.clerk.com
   - Navigate to: API Keys → Publishable keys
   - Format: `pk_live_...` or `pk_test_...`

5. **`PRODUCTION_API_URL`** (optional)
   - Your backend API URL
   - Default: `https://contextcache-api-572546880171.us-east1.run.app`

## Manual Deployment Trigger

### Option 1: Trigger via GitHub UI

1. Go to: https://github.com/thecontextcache/contextcache/actions/workflows/deploy-frontend-wrangler.yml
2. Click "Run workflow" button
3. Select branch: `main`
4. Click "Run workflow"

### Option 2: Trigger via Git (Empty Commit)

```bash
# Make sure you're on main branch
git checkout main

# Create empty commit to trigger deployment
git commit --allow-empty -m "chore: trigger deployment"

# Push to origin
git push origin main
```

### Option 3: Deploy Locally with Wrangler

```bash
# Navigate to frontend
cd frontend

# Install dependencies
pnpm install

# Build for Cloudflare
pnpm run build:cloudflare

# Deploy with wrangler (from root directory)
cd ..
npx wrangler deploy
```

## Verify Deployment

After deployment, verify:

1. **Cloudflare Dashboard**
   - Go to: Workers & Pages
   - Check: contextcache-frontend status
   - View: Deployment logs

2. **Test the Site**
   - Visit your worker URL
   - Test sign-in/sign-up flow
   - Verify theme toggle works
   - Check API connectivity

## Troubleshooting

### Deployment Failed - Missing Secrets
- **Error**: "Secret not found"
- **Fix**: Add all required secrets in GitHub Settings

### Build Failed - Type Errors
- **Error**: TypeScript compilation errors
- **Fix**: The workflow uses `|| true` to allow builds with type warnings

### Deployment Failed - Clerk Error
- **Error**: "Clerk publishable key is missing"
- **Fix**: Ensure both `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set

### Wrangler Deploy Failed
- **Error**: "Authentication error"
- **Fix**: Verify `CLOUDFLARE_API_TOKEN` has correct permissions

## Environment Variables in Cloudflare

After first deployment, also set environment variables in Cloudflare Dashboard:

1. Go to: Workers & Pages → contextcache-frontend → Settings → Variables
2. Add the same environment variables as GitHub secrets
3. Redeploy for changes to take effect

## CI/CD Workflow

The deployment process:

1. **Test** - Runs linting, type checking, tests
2. **Build** - Builds Next.js for Cloudflare Workers using OpenNext
3. **Deploy** - Deploys to Cloudflare Workers using Wrangler
4. **Verify** - Creates deployment summary

## Status Check

Check GitHub Actions status:
```
https://github.com/thecontextcache/contextcache/actions
```

Check Cloudflare deployment:
```
https://dash.cloudflare.com
```
