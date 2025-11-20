# 🚀 Cloudflare Workers Setup Guide

## Current Deployment Status

- **Working URL**: https://contextcache-frontend.doddanikhil.workers.dev/
- **Custom Domain**: thecontextcache.com (needs configuration)
- **Backend API**: Need to set production URL

## ⚠️ Critical Environment Variables Missing

You need to set these in Cloudflare Workers dashboard:

### 1. Go to Cloudflare Dashboard
https://dash.cloudflare.com/

### 2. Navigate to Workers & Pages
- Select `contextcache-frontend`
- Go to Settings → Variables and Secrets

### 3. Add These Environment Variables:

```bash
# Backend API URL (CRITICAL - currently defaults to localhost!)
NEXT_PUBLIC_API_URL=https://contextcache-api-XXXXXXXX.run.app

# Clerk Authentication (CRITICAL - sign in/up won't work without these!)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_XXXXXXXXXX
CLERK_SECRET_KEY=sk_test_XXXXXXXXXX

# App Environment
NEXT_PUBLIC_APP_ENV=production

# Optional Features
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_EXPORT=true
NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true
```

## 🔍 How to Find Your Values:

### Backend API URL:
Run this command to get your Cloud Run API URL:
```bash
gcloud run services describe contextcache-api \
  --region us-east1 \
  --format 'value(status.url)'
```

### Clerk Keys:
1. Go to https://dashboard.clerk.com/
2. Select your application
3. Go to API Keys
4. Copy both keys

## 🌐 Custom Domain Setup (thecontextcache.com)

### In Cloudflare Dashboard:
1. Go to Workers & Pages → contextcache-frontend
2. Click "Custom Domains" tab
3. Click "Add Custom Domain"
4. Enter: `thecontextcache.com`
5. Cloudflare will automatically configure DNS

### Update CORS on Backend:
After domain is configured, update backend CORS:
```bash
cd /Users/nd/Documents/contextcache
./infra/cloudrun/update-cors.sh
# Enter: https://thecontextcache.com
```

## 🔄 After Setting Environment Variables:

### Option 1: Trigger Redeployment via Git
```bash
cd /Users/nd/Documents/contextcache
git commit --allow-empty -m "trigger: redeploy with env vars"
git push origin main
```

### Option 2: Manual Redeploy
```bash
cd /Users/nd/Documents/contextcache/frontend
pnpm run deploy
```

## ✅ Verification Steps:

1. **Check API Connection**:
   - Open browser console on https://contextcache-frontend.doddanikhil.workers.dev/
   - Should NOT see "localhost:8000" errors

2. **Check Clerk Authentication**:
   - Click "Sign In" button
   - Should open Clerk modal (not redirect to nowhere)

3. **Check Dashboard**:
   - Sign in successfully
   - Should redirect to /dashboard
   - Should see project creation interface

## 🐛 Current Issues & Fixes:

### Issue 1: "Network error. Is the backend running at http://localhost:8000?"
**Cause**: `NEXT_PUBLIC_API_URL` not set in Cloudflare Workers
**Fix**: Add the environment variable as shown above

### Issue 2: Sign In/Sign Up buttons don't work
**Cause**: Clerk keys not configured in Cloudflare Workers
**Fix**: Add both Clerk environment variables

### Issue 3: thecontextcache.com shows error
**Cause**: Custom domain not configured yet
**Fix**: Follow "Custom Domain Setup" section above

### Issue 4: Colors not applied to all pages
**Cause**: Only homepage uses new color scheme
**Fix**: Being implemented now (updating all pages)

## 📝 Next Steps:

1. ✅ Set environment variables in Cloudflare (YOU NEED TO DO THIS)
2. ✅ Configure custom domain (YOU NEED TO DO THIS)
3. ⏳ I'm updating all pages with new colors now
4. ⏳ I'm fixing dashboard routing
5. ⏳ After env vars are set, trigger redeployment

