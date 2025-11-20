# 🚨 Fix 500 Internal Server Error

## Problem

Site deploys successfully but shows **500 Internal Server Error** when you visit it.

## Root Cause

Environment variables are set in Cloudflare Pages dashboard but not being passed to the worker at runtime. This causes Clerk to fail initialization.

## Solution

### Step 1: Check Environment Variables in Cloudflare

Go to: https://dash.cloudflare.com/
1. Navigate to: **Workers & Pages** → **contextcache**
2. Click: **Settings** → **Environment variables**
3. Make sure variables are set for **Production** environment

### Step 2: Verify These Variables Exist

**CRITICAL - Must be Plain Text (NOT encrypted):**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_APP_ENV
```

**Must be Secret (encrypted):**
```
CLERK_SECRET_KEY
```

### Step 3: Set Variables for Production Environment

In Cloudflare dashboard:
1. Go to **Settings** → **Environment variables**
2. For each variable, click **Edit**
3. Make sure **Production** is selected (not just Preview)
4. Save each variable

### Step 4: Redeploy

After setting variables for production environment:

```bash
cd /Users/nd/Documents/contextcache/frontend
rm -rf .open-next
pnpm run build:cloudflare
pnpm run deploy:cloudflare
```

## Alternative: Check if Clerk Keys Are Valid

The 500 error might also be caused by invalid Clerk keys.

### Verify Clerk Configuration:

1. Go to: https://dashboard.clerk.com/
2. Select your application
3. Go to: **API Keys**
4. Make sure you're using the correct keys:
   - **Publishable key** (starts with `pk_live_` or `pk_test_`)
   - **Secret key** (starts with `sk_live_` or `sk_test_`)

### Check Domain Configuration in Clerk:

1. In Clerk dashboard, go to: **Domains**
2. Make sure these domains are added:
   - `contextcache.pages.dev`
   - `thecontextcache.com`
   - `localhost:3000` (for local development)

## Debugging Steps

### 1. Check Deployment Logs

In Cloudflare dashboard:
1. Go to **Deployments** tab
2. Click on latest deployment
3. Check **Functions log** for errors

### 2. Test Locally

```bash
cd /Users/nd/Documents/contextcache/frontend
pnpm dev
```

Visit `http://localhost:3000` - if it works locally but not in production, it's an environment variable issue.

### 3. Check Browser Console

1. Open browser console (F12)
2. Visit your site
3. Look for errors related to Clerk or missing environment variables

## Common Issues

### Issue 1: Variables Not Set for Production

**Symptom**: Site works in preview but not production
**Fix**: Set variables for **Production** environment in Cloudflare

### Issue 2: Invalid Clerk Keys

**Symptom**: 500 error immediately on page load
**Fix**: Verify Clerk keys are correct and for the right environment (test vs live)

### Issue 3: Domain Not Configured in Clerk

**Symptom**: Clerk fails to initialize
**Fix**: Add your domain to Clerk's allowed domains list

### Issue 4: Missing NEXT_PUBLIC_ Prefix

**Symptom**: Variables undefined in client-side code
**Fix**: Ensure client-side variables have `NEXT_PUBLIC_` prefix

## Quick Test

After fixing, test these URLs:
- https://contextcache.pages.dev
- https://thecontextcache.com

Both should load without 500 error.

## If Still Not Working

Try deploying without Clerk temporarily to isolate the issue:

1. Comment out Clerk imports in `frontend/app/layout.tsx`
2. Rebuild and redeploy
3. If it works, the issue is with Clerk configuration
4. If it still fails, check other environment variables

## Need Help?

Check these logs:
1. Cloudflare Pages deployment logs
2. Browser console errors
3. Wrangler tail logs (if available)

The most common cause is environment variables not being set for the **Production** environment in Cloudflare Pages.

