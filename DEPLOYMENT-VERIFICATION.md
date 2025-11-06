# ContextCache Deployment Verification Checklist

## 🔍 Your Current Setup

**GCP Project**: `contextcache-prod` (Project #572546880171)

---

## ✅ Step 1: Get Your Google Cloud Run Backend URL

### Option A: Google Cloud Console (Fastest)

1. **Go to**: https://console.cloud.google.com/run?project=contextcache-prod
2. **Look for service**: `contextcache-api` (or similar name)
3. **Copy the URL** - it looks like:
   ```
   https://contextcache-api-xxxxx-uc.a.run.app
   ```
   OR
   ```
   https://contextcache-api-xxxxx-uk.a.run.app
   ```

### Option B: Use gcloud CLI

```bash
# Authenticate
gcloud auth login

# Set project
gcloud config set project contextcache-prod

# List all Cloud Run services
gcloud run services list --platform=managed

# Get specific service URL (replace REGION)
gcloud run services describe contextcache-api \
  --platform=managed \
  --region=us-east1 \
  --format='value(status.url)'
```

### Common Regions to Check:
- `us-east1` (Virginia)
- `us-central1` (Iowa)
- `us-west1` (Oregon)
- `europe-west1` (Belgium)

---

## ✅ Step 2: Verify Backend is Running

Once you have the URL, test it:

```bash
# Test health endpoint (replace with your actual URL)
curl https://contextcache-api-xxxxx-uc.a.run.app/health

# Expected response:
# {"status":"healthy","version":"1.0.0"}

# Test API docs
# Open in browser:
# https://contextcache-api-xxxxx-uc.a.run.app/docs
```

---

## ✅ Step 3: Check Cloud Run Environment Variables

Your backend needs these environment variables in Cloud Run:

### Required Variables:

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_2M6YUmRNInlp@ep-soft-cloud-adkmatwy-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require` | Already in your `api/.env.local` |
| `UPSTASH_REDIS_REST_URL` | `https://sunny-basilisk-20580.upstash.io` | Already in your `api/.env.local` |
| `UPSTASH_REDIS_REST_TOKEN` | `AVBkAAIncDIzNTJiOTIxNTc3Y2Q0NWNlOTVhOGYxY2I3Y2IzMDhhOXAyMjA1ODA` | Already in your `api/.env.local` |
| `REDIS_URL` | `rediss://default:AVBkAAIncDIzNTJiOTIxNTc3Y2Q0NWNlOTVhOGYxY2I3Y2IzMDhhOXAyMjA1ODA@sunny-basilisk-20580.upstash.io:6379` | Already in your `api/.env.local` |
| `CLERK_SECRET_KEY` | `sk_test_sR1Yll7O1p9jZEodV7salu2FG28iyTfeBKxaaWn6xs` | ⚠️ TEST key - get LIVE key for production |
| `CORS_ORIGINS` | `https://thecontextcache.com,https://contextcache-frontend.doddanikhil.workers.dev` | Must include your frontend domains |

### How to Check/Update in Cloud Run:

1. Go to: https://console.cloud.google.com/run?project=contextcache-prod
2. Click on `contextcache-api` service
3. Click **"Edit & Deploy New Revision"**
4. Scroll to **"Variables & Secrets"** section
5. Verify all variables are set
6. If missing, add them
7. Click **"Deploy"**

---

## ✅ Step 4: Update Frontend Worker Environment Variables

### Add to Cloudflare Worker:

1. Go to: https://dash.cloudflare.com/
2. **Workers & Pages** → **contextcache-frontend**
3. **Settings** → **Variables and Secrets**
4. Add/Update these:

| Variable Name | Type | Value |
|---------------|------|-------|
| `NEXT_PUBLIC_API_URL` | Text | `https://contextcache-api-xxxxx-uc.a.run.app` ← **YOUR CLOUD RUN URL** |
| `NEXT_PUBLIC_APP_ENV` | Text | `production` |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Text | `false` |
| `NEXT_PUBLIC_ENABLE_EXPORT` | Text | `true` |
| `NEXT_PUBLIC_ENABLE_GRAPH_VIEW` | Text | `true` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Text | `pk_test_dGhhbmtmdWwtc2F0eXItNzIuY2xlcmsuYWNjb3VudHMuZGV2JA` |
| `CLERK_SECRET_KEY` | Secret | `sk_test_sR1Yll7O1p9jZEodV7salu2FG28iyTfeBKxaaWn6xs` |

5. Click **"Save and Deploy"**

---

## ✅ Step 5: Redeploy Frontend

```bash
cd /home/user/contextcache/frontend
wrangler deploy
```

---

## ✅ Step 6: Test Full Stack

### Test 1: Frontend Loads
1. Visit: https://thecontextcache.com
2. Should see homepage (not 404)

### Test 2: Authentication Works
1. Click **"Sign In"**
2. Sign in with Clerk
3. Should redirect to `/dashboard`

### Test 3: API Connection Works
1. Go to `/dashboard/new`
2. Create a new project
3. Should NOT see "localhost" error
4. Should successfully create project

### Test 4: Backend Direct Access
```bash
# Replace with your actual Cloud Run URL
curl https://contextcache-api-xxxxx-uc.a.run.app/health
curl https://contextcache-api-xxxxx-uc.a.run.app/docs
```

---

## 🔧 Troubleshooting

### Error: "Failed to fetch" or "Network Error"

**Cause**: Frontend can't reach backend

**Check**:
1. Is `NEXT_PUBLIC_API_URL` set in Cloudflare Worker?
2. Is Cloud Run service running?
3. Is CORS configured correctly in Cloud Run?

**Fix**:
```bash
# Check Cloud Run CORS in environment variable
CORS_ORIGINS=https://thecontextcache.com,https://contextcache-frontend.doddanikhil.workers.dev
```

### Error: "Connection to localhost:8000 failed"

**Cause**: Frontend is using default localhost URL

**Fix**: Add `NEXT_PUBLIC_API_URL` to Cloudflare Worker variables and redeploy

### Error: 403 Forbidden / CORS Error

**Cause**: Cloud Run not allowing requests from your domain

**Fix**: Update `CORS_ORIGINS` in Cloud Run environment variables

### Error: 500 Internal Server Error from Backend

**Cause**: Backend can't connect to database/redis

**Check**:
1. Are `DATABASE_URL` and `REDIS_URL` set in Cloud Run?
2. Are the credentials correct?
3. Check Cloud Run logs: https://console.cloud.google.com/run/detail/YOUR_REGION/contextcache-api/logs?project=contextcache-prod

---

## 📊 Architecture Summary

```
┌─────────────────────────────────────────────────┐
│ User Browser                                    │
│   ↓                                             │
│ thecontextcache.com                            │
│   ↓                                             │
│ Cloudflare Worker (Frontend) ✅ DEPLOYED       │
│   ↓                                             │
│ NEXT_PUBLIC_API_URL → ???                      │
│   ↓                                             │
│ Google Cloud Run (Backend)                      │
│ https://contextcache-api-xxxxx.run.app         │
│   ↓                    ↓                        │
│ Neon Postgres      Upstash Redis               │
│                                                 │
│ Clerk (Auth)                                    │
└─────────────────────────────────────────────────┘
```

**Current Problem**: `NEXT_PUBLIC_API_URL` is not set, so frontend tries to call `localhost:8000`

**Solution**: Get Cloud Run URL → Add to Cloudflare Worker → Redeploy

---

## 🎯 Action Items (In Order)

- [ ] Get Cloud Run backend URL from https://console.cloud.google.com/run?project=contextcache-prod
- [ ] Verify backend is running: `curl https://your-url.run.app/health`
- [ ] Check Cloud Run environment variables (especially CORS_ORIGINS)
- [ ] Add `NEXT_PUBLIC_API_URL` to Cloudflare Worker
- [ ] Add all other Cloudflare Worker environment variables
- [ ] Redeploy frontend: `wrangler deploy`
- [ ] Test: Visit thecontextcache.com and create a project
- [ ] Verify no "localhost" errors in browser console

---

## 📝 Notes

- You're being charged for Cloud Run because the backend is running (good!)
- Frontend is deployed on Cloudflare Workers (free/cheap)
- Database (Neon) and Cache (Upstash) are serverless (you have these configured)
- Just need to connect frontend → backend with the correct URL

---

**Next Step**: Go to https://console.cloud.google.com/run?project=contextcache-prod and copy your backend URL!
