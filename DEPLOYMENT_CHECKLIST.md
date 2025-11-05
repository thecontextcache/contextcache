# 🚀 Production Deployment Checklist

This document provides a comprehensive checklist for deploying ContextCache to production.

## ⚠️ Critical Issues Preventing Deployment

### 1. Frontend Deployment (Cloudflare Pages) - Missing Environment Variables

**Status**: ❌ **BLOCKING DEPLOYMENT**

Your frontend build is **failing** because Clerk environment variables are **not configured** in Cloudflare Pages.

**Error**:
```
Error: @clerk/clerk-react: Missing publishableKey.
You can get your key at https://dashboard.clerk.com/last-active?path=api-keys.
```

**Solution**:
1. Go to Cloudflare Pages Dashboard
2. Select your `contextcache-frontend` project
3. Go to **Settings** → **Environment variables**
4. Add the following variables for **Production**:

```bash
# REQUIRED - Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dGhhbmtmdWwtc2F0eXItNzIuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=sk_test_sR1Yll7O1p9jZEodV7salu2FG28iyTfeBKxaaWn6xs

# REQUIRED - API Configuration
NEXT_PUBLIC_API_URL=https://your-api-url.run.app
NEXT_PUBLIC_APP_ENV=production

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_EXPORT=true
NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true
```

5. **Save** and **trigger a new deployment**

---

### 2. Backend Deployment (Google Cloud Run) - Missing SESSION_ENCRYPTION_KEY

**Status**: ⚠️ **INSECURE** (using fallback)

Your backend is currently using `CLERK_SECRET_KEY` as a fallback for session encryption, which is **insecure**.

**Solution**:
1. Generate a secure 32-byte key:
   ```bash
   openssl rand -base64 32
   ```

2. Add to **GCP Secret Manager**:
   ```bash
   # Go to GCP Console → Secret Manager
   # Create new secret named: SESSION_ENCRYPTION_KEY
   # Value: <output from openssl command above>
   ```

3. Update your Cloud Run deployment to include this secret (it's already in the deployment script)

---

## 📋 Complete Deployment Checklist

### Phase 1: Pre-Deployment (Local Testing)

- [x] ✅ All code changes committed
- [x] ✅ Frontend builds successfully locally (`pnpm build`)
- [x] ✅ Backend tests pass (`pytest`)
- [ ] ⚠️ Frontend environment variables documented in `.env.example`
- [ ] ⚠️ Clerk authentication tested locally
- [ ] ⚠️ Database migration tested

### Phase 2: Environment Variable Configuration

#### Frontend (Cloudflare Pages)

Go to: **Cloudflare Dashboard** → **Pages** → **Your Project** → **Settings** → **Environment Variables**

**Production Variables:**

| Variable | Value | Required? | Notes |
|----------|-------|-----------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | ✅ **YES** | From Clerk dashboard |
| `CLERK_SECRET_KEY` | `sk_test_...` | ✅ **YES** | From Clerk dashboard |
| `NEXT_PUBLIC_API_URL` | `https://your-api.run.app` | ✅ **YES** | Your Cloud Run URL |
| `NEXT_PUBLIC_APP_ENV` | `production` | ✅ **YES** | Environment name |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `true` | ⚪ Optional | Enable analytics |
| `NEXT_PUBLIC_ENABLE_EXPORT` | `true` | ⚪ Optional | Enable export feature |
| `NEXT_PUBLIC_ENABLE_GRAPH_VIEW` | `true` | ⚪ Optional | Enable graph view |

#### Backend (Google Cloud Secret Manager)

Go to: **GCP Console** → **Secret Manager**

**Required Secrets:**

| Secret Name | Value Source | Required? | Notes |
|-------------|--------------|-----------|-------|
| `DATABASE_URL` | Neon Postgres connection string | ✅ **YES** | Already configured |
| `REDIS_URL` | Upstash Redis connection string | ✅ **YES** | Already configured |
| `CLERK_SECRET_KEY` | Clerk dashboard | ✅ **YES** | For user authentication |
| `SESSION_ENCRYPTION_KEY` | `openssl rand -base64 32` | ✅ **YES** | **GENERATE NEW** |
| `API_INTERNAL_KEY` | `openssl rand -hex 32` | ✅ **YES** | Already configured |

### Phase 3: Database Migration

**Status**: ⚠️ **PENDING**

Your production database needs the new encryption columns.

**Steps**:
1. Backup your production database first:
   ```bash
   # Via Neon dashboard or pg_dump
   ```

2. Run migration (automatically handled by deployment workflow):
   ```bash
   # This happens during `gcloud run jobs execute contextcache-migrate-*`
   ```

3. Manual migration (if needed):
   ```bash
   # Connect to your Neon database
   psql "$DATABASE_URL"

   # Run migration
   \i api/migrations/002_add_content_encryption.sql
   ```

### Phase 4: Deployment Execution

#### Option A: Merge PR and Tag for Full Deployment

1. **Merge the fix PR**:
   ```bash
   # Merge claude/fix-theme-toggle-011CUqDZGiyp2UshTJTGyFCC → main
   ```

2. **Create and push tag**:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v0.2.0 -m "Release v0.2.0: Production-ready with encryption and glassmorphism UI"
   git push origin v0.2.0
   ```

3. **Monitor deployment**:
   - Frontend: https://github.com/thecontextcache/contextcache/actions (Deploy Frontend workflow)
   - Backend: https://github.com/thecontextcache/contextcache/actions (Deploy API workflow)

#### Option B: Manual Workflow Trigger

1. Go to: https://github.com/thecontextcache/contextcache/actions
2. Select **"Deploy Frontend"** workflow
3. Click **"Run workflow"** → Select `main` branch
4. Wait for completion (~5-10 minutes)

### Phase 5: Post-Deployment Verification

#### Frontend Checks

Visit your live site and verify:

- [ ] ✅ Landing page loads with glassmorphism effects
- [ ] ✅ Floating orb backgrounds visible
- [ ] ✅ **Clerk sign-in/sign-up buttons visible in header** (top-right)
- [ ] ✅ **Can click "Sign In" and see Clerk modal**
- [ ] ✅ Enhanced theme toggle works (animated)
- [ ] ✅ Color scheme is indigo-purple-pink gradients
- [ ] ✅ Dark mode toggle works smoothly
- [ ] ✅ Navigation bar has glassmorphic styling
- [ ] ✅ All icons render (Lucide icons)
- [ ] ✅ Responsive design works on mobile

#### Backend Checks

Test API endpoints:

```bash
# Health check
curl https://your-api.run.app/health

# Expected: {"status":"healthy","version":"0.2.0"}
```

#### Authentication Flow Checks

1. [ ] ✅ Click "Sign Up" button
2. [ ] ✅ Clerk modal opens
3. [ ] ✅ Can create account
4. [ ] ✅ Redirects to /dashboard after sign up
5. [ ] ✅ User button visible (avatar top-right)
6. [ ] ✅ Can sign out
7. [ ] ✅ Can sign back in

### Phase 6: Troubleshooting

#### Frontend Not Showing Changes

**Symptoms:**
- Old UI still visible
- Login buttons missing
- Errors in browser console

**Solutions:**
1. **Check Cloudflare Pages build logs**:
   - Go to Cloudflare Dashboard → Pages → Your Project → View Build
   - Look for errors

2. **Verify environment variables are set**:
   - Cloudflare Dashboard → Pages → Settings → Environment Variables
   - Ensure all required variables are present

3. **Hard refresh browser**:
   - Chrome/Edge: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
   - Firefox: `Ctrl + F5`
   - Safari: `Cmd + Option + R`

4. **Check for build errors**:
   ```bash
   # Clone repo and build locally
   cd frontend
   pnpm install
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm build
   ```

#### Backend API Errors

**Symptoms:**
- 500 errors
- "Missing publishableKey" errors
- Database connection failures

**Solutions:**
1. **Check Cloud Run logs**:
   ```bash
   gcloud run services logs read contextcache-api --region=us-east1
   ```

2. **Verify secrets are accessible**:
   ```bash
   gcloud secrets list --project=your-project-id
   ```

3. **Check database connectivity**:
   ```bash
   # Test from Cloud Shell
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

---

## 🎯 Quick Start: Get Live in 10 Minutes

If you just want to get the site live quickly:

### Step 1: Configure Cloudflare Pages (2 minutes)
1. Go to Cloudflare Pages dashboard
2. Add these 3 variables:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dGhhbmtmdWwtc2F0eXItNzIuY2xlcmsuYWNjb3VudHMuZGV2JA
   CLERK_SECRET_KEY=sk_test_sR1Yll7O1p9jZEodV7salu2FG28iyTfeBKxaaWn6xs
   NEXT_PUBLIC_API_URL=https://your-api.run.app
   ```
3. Save

### Step 2: Merge Fix PR (1 minute)
1. Go to: https://github.com/thecontextcache/contextcache/pulls
2. Find PR for `claude/fix-theme-toggle-011CUqDZGiyp2UshTJTGyFCC`
3. Click **"Merge"**

### Step 3: Wait for Deployment (5-7 minutes)
1. Go to: https://github.com/thecontextcache/contextcache/actions
2. Watch **"Deploy Frontend"** workflow
3. Wait for green checkmark ✅

### Step 4: Verify (1 minute)
1. Visit your Cloudflare Pages URL
2. Hard refresh (`Ctrl + Shift + R`)
3. See the new glassmorphic UI!
4. Check that Sign In/Sign Up buttons are visible

---

## 📊 Deployment Status Summary

| Component | Status | Blocker | Action Required |
|-----------|--------|---------|-----------------|
| **Frontend Code** | ✅ Ready | None | Merge PR |
| **Frontend Env Vars** | ❌ Missing | Clerk keys not in Cloudflare | **Add to Cloudflare Pages** |
| **Backend Code** | ✅ Ready | None | Create v0.2.0 tag |
| **Backend Env Vars** | ⚠️ Partial | SESSION_ENCRYPTION_KEY fallback | **Add to GCP Secret Manager** |
| **Database Migration** | ⚠️ Pending | New columns needed | Run on tag push |
| **Dependencies** | ✅ Installed | None | None |

---

## 🆘 Need Help?

If you're stuck:

1. **Check GitHub Actions logs**: https://github.com/thecontextcache/contextcache/actions
2. **Check Cloudflare Pages logs**: Cloudflare Dashboard → Pages → View Build
3. **Check Cloud Run logs**: GCP Console → Cloud Run → contextcache-api → Logs
4. **Browser console**: F12 → Console tab (look for errors)

---

## 🎉 Success Criteria

You'll know deployment succeeded when:

✅ You visit your live site and see:
- Glassmorphism cards with blur effects
- Floating gradient orbs in background
- Indigo-purple-pink color scheme
- **Sign In / Sign Up buttons in top-right corner**
- **Animated theme toggle in navigation**
- Landing page with "Get Started" button

✅ Authentication works:
- Click "Sign In" → Clerk modal opens
- Can sign up for account
- Redirects to dashboard
- Avatar shows in top-right when logged in

✅ No errors in browser console

---

**Generated**: 2025-11-05
**For**: ContextCache v0.2.0 Production Deployment
