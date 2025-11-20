# 🚀 ContextCache Deployment Guide

Complete guide for deploying ContextCache to production.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Deployment (Google Cloud Run)](#backend-deployment)
3. [Frontend Deployment (Cloudflare Workers)](#frontend-deployment)
4. [Environment Variables](#environment-variables)
5. [Custom Domain Setup](#custom-domain-setup)
6. [Verification & Testing](#verification--testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- [x] Google Cloud Platform account
- [x] Cloudflare account
- [x] Clerk account (for authentication)
- [x] Neon account (PostgreSQL database)
- [x] Upstash account (Redis)
- [x] GitHub account

### Required Tools
```bash
# Install gcloud CLI
brew install google-cloud-sdk

# Install pnpm
npm install -g pnpm

# Install wrangler (Cloudflare CLI)
npm install -g wrangler

# Login to services
gcloud auth login
wrangler login
```

---

## Backend Deployment

### 1. Deploy API Service

```bash
cd /Users/nd/Documents/contextcache

# Deploy API to Cloud Run
gcloud run deploy contextcache-api \
  --source ./api \
  --region us-east1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,API_INTERNAL_KEY=API_INTERNAL_KEY:latest" \
  --set-env-vars "PYTHON_ENV=production,CORS_ORIGINS=*" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --port 8000
```

### 2. Deploy Worker Service

```bash
gcloud run deploy contextcache-worker \
  --source ./api \
  --region us-east1 \
  --platform managed \
  --no-allow-unauthenticated \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest" \
  --set-env-vars "PYTHON_ENV=production,WORKER_CONCURRENCY=4" \
  --min-instances 1 \
  --max-instances 5 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --command "python" \
  --args "run_worker.py"
```

### 3. Get API URL

```bash
gcloud run services describe contextcache-api \
  --region us-east1 \
  --format 'value(status.url)'
```

Save this URL - you'll need it for frontend configuration.

---

## Frontend Deployment

### Method 1: Git-Integrated Deployment (Recommended)

**Setup (One-time):**

1. Go to Cloudflare Dashboard: https://dash.cloudflare.com/
2. Navigate to **Workers & Pages**
3. Click **Create Application** → **Pages** → **Connect to Git**
4. Select repository: `thecontextcache/contextcache`
5. Configure build:
   ```
   Build command: pnpm run build
   Build output directory: /
   Root directory: /
   Production branch: main
   ```
6. Click **Save and Deploy**

**Future Deployments:**
```bash
# Just push to main branch
git push origin main
```

Cloudflare automatically builds and deploys!

### Method 2: Manual Deployment

```bash
cd /Users/nd/Documents/contextcache
./deploy-frontend.sh
```

---

## Environment Variables

### Backend (Google Cloud Run)

Store these in **Google Secret Manager**:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db

# Redis
REDIS_URL=redis://default:pass@host:port

# Internal API key
API_INTERNAL_KEY=your-random-key

# Clerk (for JWT verification)
CLERK_SECRET_KEY=sk_test_XXXXXXXXX
```

### Frontend (Cloudflare Workers)

**CRITICAL**: `NEXT_PUBLIC_*` variables must be **plain text** (NOT secrets)!

Go to: **Workers & Pages** → **contextcache-frontend** → **Settings** → **Variables**

Add these variables:

#### Plain Text Variables (NOT encrypted):
```bash
NEXT_PUBLIC_API_URL
Value: https://contextcache-api-XXXXXXXX-ue.a.run.app
(Your Cloud Run API URL from above)

NEXT_PUBLIC_APP_ENV
Value: production

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
Value: pk_test_XXXXXXXXXXXXXXXXX
(Get from Clerk Dashboard → API Keys)
```

#### Secret Variables (encrypted):
```bash
CLERK_SECRET_KEY
Value: sk_test_XXXXXXXXXXXXXXXXX
Type: Secret (check "Encrypt")
(Get from Clerk Dashboard → API Keys)
```

**Why NEXT_PUBLIC_* must be plain text:**
- Next.js embeds these into the client-side bundle at BUILD TIME
- If encrypted, Next.js can't access them during build
- Result: Your app can't connect to backend or Clerk

---

## Custom Domain Setup

### 1. Configure in Cloudflare

1. Go to **Workers & Pages** → **contextcache-frontend**
2. Click **Custom Domains** tab
3. Click **Add Custom Domain**
4. Enter: `thecontextcache.com`
5. Click **Add Domain**

Cloudflare automatically configures DNS (no manual DNS changes needed).

### 2. Update Backend CORS

```bash
cd /Users/nd/Documents/contextcache
./infra/cloudrun/update-cors.sh
```

When prompted, enter:
```
https://thecontextcache.com
https://contextcache-frontend.doddanikhil.workers.dev
```

This allows your frontend to make API requests to the backend.

---

## Verification & Testing

### 1. Test Backend Health

```bash
# Get API URL
API_URL=$(gcloud run services describe contextcache-api \
  --region us-east1 \
  --format 'value(status.url)')

# Test health endpoint
curl $API_URL/health

# Expected response:
# {"status":"healthy","version":"1.0.0"}
```

### 2. Test Frontend

Visit: https://thecontextcache.com/

**Check:**
- [ ] Page loads with new colors (Jupiter gold & Mercury teal)
- [ ] "Sign In" button is visible
- [ ] No console errors about missing environment variables

### 3. Test Authentication

1. Click "Sign In" button
2. Should open Clerk modal
3. Sign in with your account
4. Should redirect to `/dashboard`

### 4. Test Backend Connection

1. In dashboard, click "New Project"
2. Enter project name and passphrase
3. Click "Create Project"
4. Should succeed without "network error"

### 5. Test All Pages

Visit each page and verify colors:
- [ ] Dashboard - `/dashboard`
- [ ] Inbox - `/inbox`
- [ ] Settings - `/settings`
- [ ] Graph - `/graph`
- [ ] Audit - `/audit`
- [ ] Export - `/export`
- [ ] Ask - `/ask`

---

## Troubleshooting

### Issue: "Network error" when creating project

**Cause**: Frontend can't reach backend

**Check:**
1. Is `NEXT_PUBLIC_API_URL` set correctly?
2. Is it plain text (not encrypted)?
3. Did you redeploy after setting it?

**Fix:**
```bash
# Verify env var in Cloudflare dashboard
# Then trigger redeploy:
git commit --allow-empty -m "trigger: redeploy"
git push origin main
```

### Issue: Sign In button doesn't work

**Cause**: Clerk not initialized

**Check:**
1. Is `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set?
2. Is it plain text (not encrypted)?
3. Is the key correct?

**Fix:**
1. Go to Clerk Dashboard → API Keys
2. Copy the publishable key (starts with `pk_`)
3. Add to Cloudflare as plain text
4. Redeploy

### Issue: 401 Unauthorized errors

**Cause**: Backend CORS not configured

**Fix:**
```bash
./infra/cloudrun/update-cors.sh
```

### Issue: Duplicate Cloudflare Workers

**Cause**: Both manual and Git-integrated deployments

**Fix:**
1. Choose one deployment method
2. Delete the other worker
3. If "too many deployments" error:
   - Go to Deployments tab
   - Delete old deployments in batches
   - Then delete the worker

### Issue: Build fails in Cloudflare

**Check logs:**
1. Go to Workers & Pages → contextcache-frontend
2. Click Deployments tab
3. Click failed deployment
4. View build logs

**Common causes:**
- Missing environment variables
- `NEXT_PUBLIC_*` variables encrypted (should be plain text)
- Build command incorrect

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USERS                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKERS                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  contextcache-frontend                          │   │
│  │  - Next.js 15 SSR                               │   │
│  │  - Clerk Authentication                         │   │
│  │  - Domain: thecontextcache.com                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTPS
┌─────────────────────────────────────────────────────────┐
│              GOOGLE CLOUD RUN (us-east1)                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  contextcache-api                               │   │
│  │  - FastAPI                                      │   │
│  │  - Clerk JWT verification                       │   │
│  │  - End-to-end encryption                        │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  contextcache-worker                            │   │
│  │  - Background jobs (Arq)                        │   │
│  │  - Document processing                          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   DATA LAYER                             │
│  ┌────────────────────┐  ┌──────────────────────────┐  │
│  │  Neon PostgreSQL   │  │  Upstash Redis           │  │
│  │  - User data       │  │  - KEK/DEK cache         │  │
│  │  - Projects        │  │  - Rate limiting         │  │
│  │  - Documents       │  │  - Job queue             │  │
│  │  - pgvector        │  │                          │  │
│  └────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference

### Useful Commands

```bash
# Backend logs
gcloud logging tail "resource.labels.service_name=contextcache-api" --limit 50

# Backend health check
curl $(gcloud run services describe contextcache-api --region us-east1 --format 'value(status.url)')/health

# Frontend deployment (manual)
cd frontend && pnpm run deploy:cloudflare

# Update CORS
./infra/cloudrun/update-cors.sh

# Trigger Git deployment
git commit --allow-empty -m "trigger: deploy"
git push origin main
```

### Important URLs

- **Production Frontend**: https://thecontextcache.com/
- **Workers.dev**: https://contextcache-frontend.doddanikhil.workers.dev/
- **Cloudflare Dashboard**: https://dash.cloudflare.com/
- **Google Cloud Console**: https://console.cloud.google.com/
- **Clerk Dashboard**: https://dashboard.clerk.com/

---

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Review Cloudflare Workers logs
3. Review Cloud Run logs
4. Check browser console for errors
5. Verify all environment variables are set correctly

Remember: `NEXT_PUBLIC_*` variables must be **plain text**, not secrets!
