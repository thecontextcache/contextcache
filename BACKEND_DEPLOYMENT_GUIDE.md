# Backend API Deployment Guide - Google Cloud Run

## Overview

This guide walks through deploying the ContextCache API to Google Cloud Run. The backend is **production-ready** and deployment is **not blocked** (unlike the frontend which has Cloudflare adapter issues).

## Architecture

- **Platform**: Google Cloud Run (serverless containers)
- **Container Registry**: Google Container Registry (GCR)
- **Database**: Neon Postgres (serverless PostgreSQL)
- **Cache/Queue**: Upstash Redis (serverless Redis)
- **Authentication**: Clerk (JWT verification)
- **Monitoring**: Sentry (optional)

## Prerequisites

1. **Google Cloud Account**
   - Project ID: `contextcache-prod` (or your project ID)
   - Billing enabled
   - Cloud Run API enabled
   - Cloud Build API enabled

2. **External Services**
   - Neon Postgres database (free tier available)
   - Upstash Redis (free tier available)
   - Clerk account (free tier available)
   - Sentry account (optional, free tier available)

3. **Local Tools**
   ```bash
   # Install gcloud CLI
   # Visit: https://cloud.google.com/sdk/docs/install

   # Authenticate
   gcloud auth login
   gcloud config set project contextcache-prod
   ```

---

## Step 1: Set up Database (Neon Postgres)

### 1.1 Create Neon Database

1. Go to https://neon.tech
2. Sign up / Log in
3. Create new project: "ContextCache Production"
4. Copy the connection string (it will look like):
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/contextcache?sslmode=require
   ```

### 1.2 Run Database Migrations

```bash
cd api

# Set DATABASE_URL temporarily for migration
export DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/contextcache?sslmode=require"

# Run migrations with Alembic
alembic upgrade head

# Verify tables were created
# You can check in Neon dashboard or use psql
```

---

## Step 2: Set up Redis (Upstash)

### 2.1 Create Upstash Redis

1. Go to https://upstash.com
2. Sign up / Log in
3. Create new database: "contextcache-prod"
4. Region: Choose closest to your Cloud Run region
5. Copy the connection string (format):
   ```
   redis://default:password@endpoint.upstash.io:6379
   ```
   Or use the TLS version:
   ```
   rediss://default:password@endpoint.upstash.io:6380
   ```

---

## Step 3: Set up Authentication (Clerk)

### 3.1 Create Clerk Application

1. Go to https://clerk.com
2. Create application: "ContextCache Production"
3. Configure authentication methods (email, Google, etc.)
4. Get your keys from dashboard:
   ```
   CLERK_SECRET_KEY=sk_live_xxxxx
   CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
   ```

### 3.2 Get Clerk Issuer URL

The issuer URL is typically:
- For live keys: `https://your-app.clerk.accounts.com`
- For test keys: `https://clerk.accounts.dev`

Check your Clerk dashboard for the exact issuer URL.

---

## Step 4: Set up Monitoring (Optional - Sentry)

### 4.1 Create Sentry Project

1. Go to https://sentry.io
2. Create project: "ContextCache API"
3. Platform: Python
4. Copy DSN (Data Source Name):
   ```
   https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

---

## Step 5: Build and Push Docker Image

### 5.1 Using Cloud Build (Recommended)

```bash
# From project root
gcloud builds submit \
  --config=cloudbuild-api.yaml \
  --project=contextcache-prod

# This will:
# 1. Build Docker image using infra/api.Dockerfile
# 2. Push to gcr.io/contextcache-prod/contextcache-api:latest
# 3. Take ~2-5 minutes
```

### 5.2 Alternative: Local Build + Push

```bash
# Build locally
docker build \
  -f infra/api.Dockerfile \
  -t gcr.io/contextcache-prod/contextcache-api:latest \
  --target production \
  .

# Push to GCR
docker push gcr.io/contextcache-prod/contextcache-api:latest
```

---

## Step 6: Deploy to Cloud Run

### 6.1 Set Environment Variables

Create a file `backend-env.yaml` with your secrets:

```yaml
DATABASE_URL: "postgresql://user:password@ep-xxx.region.aws.neon.tech/contextcache?sslmode=require"
REDIS_URL: "rediss://default:password@endpoint.upstash.io:6380"
CLERK_SECRET_KEY: "sk_live_xxxxx"
CLERK_PUBLISHABLE_KEY: "pk_live_xxxxx"
CLERK_ISSUER: "https://your-app.clerk.accounts.com"
CORS_ORIGINS: "https://your-frontend-domain.com,https://www.your-frontend-domain.com"
SENTRY_DSN: "https://xxxxx@xxxxx.ingest.sentry.io/xxxxx"
SENTRY_TRACES_SAMPLE_RATE: "0.1"
ENVIRONMENT: "production"
```

**IMPORTANT**: Do NOT commit this file to git! Add it to `.gitignore`.

### 6.2 Deploy with Environment Variables

```bash
# Deploy to Cloud Run
gcloud run deploy contextcache-api \
  --image gcr.io/contextcache-prod/contextcache-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --env-vars-file backend-env.yaml \
  --project contextcache-prod

# This will:
# 1. Deploy container to Cloud Run
# 2. Set up HTTPS endpoint automatically
# 3. Return service URL: https://contextcache-api-xxxxx-uc.a.run.app
```

### 6.3 Alternative: Set Env Vars Individually

```bash
gcloud run deploy contextcache-api \
  --image gcr.io/contextcache-prod/contextcache-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars DATABASE_URL="postgresql://..." \
  --set-env-vars REDIS_URL="rediss://..." \
  --set-env-vars CLERK_SECRET_KEY="sk_live_..." \
  --set-env-vars CLERK_PUBLISHABLE_KEY="pk_live_..." \
  --set-env-vars CLERK_ISSUER="https://..." \
  --set-env-vars CORS_ORIGINS="https://..." \
  --set-env-vars SENTRY_DSN="https://..." \
  --set-env-vars ENVIRONMENT="production" \
  --project contextcache-prod
```

---

## Step 7: Verify Deployment

### 7.1 Test Health Endpoint

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe contextcache-api \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)' \
  --project contextcache-prod)

echo "Service URL: $SERVICE_URL"

# Test health endpoint
curl $SERVICE_URL/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "version": "0.1.0",
#   "timestamp": "2025-11-06T...",
#   "checks": {
#     "database": {"status": "connected", "type": "postgresql"},
#     "redis": {"status": "connected", "type": "redis"},
#     "monitoring": {"status": "enabled", "type": "sentry"}
#   }
# }
```

### 7.2 Test API Documentation

Visit in browser:
```
https://contextcache-api-xxxxx-uc.a.run.app/docs
```

You should see FastAPI's automatic Swagger UI documentation.

### 7.3 Check Logs

```bash
# View recent logs
gcloud run services logs read contextcache-api \
  --region us-central1 \
  --limit 50 \
  --project contextcache-prod

# Follow logs in real-time
gcloud run services logs tail contextcache-api \
  --region us-central1 \
  --project contextcache-prod
```

---

## Step 8: Configure Frontend to Use Backend

### 8.1 Update Frontend Environment

Once backend is deployed, update your frontend environment variables:

```bash
# In frontend/.env.local or Vercel environment variables
NEXT_PUBLIC_API_URL=https://contextcache-api-xxxxx-uc.a.run.app
```

### 8.2 Update CORS Settings

If you deploy frontend to a different domain, update backend CORS:

```bash
gcloud run services update contextcache-api \
  --update-env-vars CORS_ORIGINS="https://your-frontend.com,https://www.your-frontend.com" \
  --region us-central1 \
  --project contextcache-prod
```

---

## Step 9: Set up Continuous Deployment (Optional)

### 9.1 Enable Cloud Build Trigger

1. Go to Cloud Console → Cloud Build → Triggers
2. Create trigger:
   - Name: `deploy-api-on-push`
   - Event: Push to branch
   - Branch: `^main$`
   - Build configuration: Cloud Build configuration file
   - Cloud Build configuration file location: `cloudbuild-api.yaml`
3. Save

Now every push to main will:
1. Build new Docker image
2. Push to GCR
3. Auto-deploy to Cloud Run (if you add deployment step to cloudbuild-api.yaml)

### 9.2 Add Deployment to cloudbuild-api.yaml

Update `cloudbuild-api.yaml`:

```yaml
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-f'
      - 'infra/api.Dockerfile'
      - '-t'
      - 'gcr.io/contextcache-prod/contextcache-api:latest'
      - '.'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'contextcache-api'
      - '--image'
      - 'gcr.io/contextcache-prod/contextcache-api:latest'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'

images:
  - 'gcr.io/contextcache-prod/contextcache-api:latest'

timeout: '1200s'
```

---

## Monitoring and Maintenance

### View Metrics

```bash
# Open Cloud Run metrics dashboard
gcloud run services describe contextcache-api \
  --region us-central1 \
  --format='value(status.url)' \
  --project contextcache-prod
```

Or visit: Cloud Console → Cloud Run → contextcache-api → Metrics

### Update Deployment

```bash
# After making code changes:
# 1. Build new image
gcloud builds submit --config=cloudbuild-api.yaml

# 2. Cloud Run will auto-deploy if you have continuous deployment
# OR manually trigger:
gcloud run deploy contextcache-api \
  --image gcr.io/contextcache-prod/contextcache-api:latest \
  --region us-central1 \
  --project contextcache-prod
```

### Scale Configuration

```bash
# Adjust scaling parameters
gcloud run services update contextcache-api \
  --min-instances 1 \
  --max-instances 20 \
  --memory 1Gi \
  --cpu 2 \
  --region us-central1 \
  --project contextcache-prod
```

### Cost Estimation

**Free Tier (Monthly)**:
- Cloud Run: 2 million requests, 360,000 GB-seconds
- Neon: 3 GB storage, 1 compute instance
- Upstash: 10,000 commands/day
- Clerk: 10,000 MAU

**Expected costs (after free tier)**:
- Cloud Run: ~$5-20/month (depends on traffic)
- Neon: $0-19/month
- Upstash: $0-10/month
- Clerk: $25/month (Pro plan for production)
- **Total**: $30-75/month for moderate traffic

---

## Troubleshooting

### Issue: Health Check Fails - Database Connection

```bash
# Check database connection from local
export DATABASE_URL="your-connection-string"
cd api
python -c "from cc_core.storage.database import init_db; import asyncio; asyncio.run(init_db())"
```

### Issue: Authentication Not Working

```bash
# Verify Clerk configuration
gcloud run services describe contextcache-api \
  --region us-central1 \
  --format='json' | jq '.spec.template.spec.containers[0].env'

# Check that CLERK_* vars are set correctly
```

### Issue: CORS Errors from Frontend

```bash
# Update CORS origins
gcloud run services update contextcache-api \
  --update-env-vars CORS_ORIGINS="https://your-domain.com" \
  --region us-central1
```

### Issue: Container Fails to Start

```bash
# Check detailed logs
gcloud run services logs read contextcache-api \
  --region us-central1 \
  --limit 100 \
  --format=json | jq '.'

# Common issues:
# 1. Missing required env vars (DATABASE_URL)
# 2. Database connection failure
# 3. Port mismatch (must be 8000)
```

---

## Security Best Practices

### 1. Use Secret Manager (Recommended for Production)

```bash
# Store secrets in Secret Manager
echo -n "postgresql://..." | gcloud secrets create database-url --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding database-url \
  --member=serviceAccount:your-service-account@contextcache-prod.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Update Cloud Run to use secrets
gcloud run services update contextcache-api \
  --update-secrets DATABASE_URL=database-url:latest \
  --region us-central1
```

### 2. Enable IAM Authentication

For production, consider enabling IAM authentication:

```bash
gcloud run services update contextcache-api \
  --no-allow-unauthenticated \
  --region us-central1

# Then add IAM bindings for specific users/services
```

### 3. Set up VPC Connector (for private database)

If your database is in a VPC:

```bash
gcloud run services update contextcache-api \
  --vpc-connector your-vpc-connector \
  --region us-central1
```

---

## Next Steps

1. **Deploy Backend**: Follow this guide to deploy API to Cloud Run
2. **Deploy Frontend**: Once Cloudflare adapter is fixed, or deploy to Vercel
3. **Set up Monitoring**: Configure Sentry alerts and Cloud Run monitoring
4. **Configure Domain**: Set up custom domain for API
5. **Set up Backup**: Configure database backups in Neon

---

## Support and Resources

- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Neon Docs**: https://neon.tech/docs
- **Upstash Docs**: https://docs.upstash.com
- **Clerk Docs**: https://clerk.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com

---

**Status**: ✅ Backend is production-ready and can be deployed immediately!
