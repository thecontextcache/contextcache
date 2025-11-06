# Production Deployment Guide

This guide covers deploying ContextCache to production using:
- **Frontend**: Cloudflare Pages (Next.js with Edge Runtime)
- **Backend**: Google Cloud Run (FastAPI)
- **Database**: Neon Postgres (managed PostgreSQL)
- **Cache**: Upstash Redis (serverless Redis)

## Prerequisites

1. Accounts created on:
   - [Cloudflare Pages](https://pages.cloudflare.com/)
   - [Google Cloud Platform](https://console.cloud.google.com/)
   - [Neon](https://neon.tech/) (PostgreSQL)
   - [Upstash](https://upstash.com/) (Redis)
   - [Clerk](https://clerk.com/) (Authentication)

2. CLI tools installed:
   ```bash
   # Google Cloud SDK
   curl https://sdk.cloud.google.com | bash

   # Wrangler (Cloudflare CLI)
   npm install -g wrangler
   ```

## Part 1: Database Setup (Neon Postgres)

### 1.1 Create Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project: "contextcache-prod"
3. Copy the connection string (starts with `postgresql://`)
4. Save it as `DATABASE_URL`

### 1.2 Run Migrations

```bash
# Set environment variable
export DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/contextcache?sslmode=require"

# Navigate to API directory
cd api

# Run migrations
alembic upgrade head
```

## Part 2: Redis Setup (Upstash)

### 2.1 Create Redis Instance

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Select region closest to your backend
4. Copy the connection string (starts with `rediss://`)
5. Save it as `REDIS_URL`

## Part 3: Authentication Setup (Clerk)

### 3.1 Create Clerk Application

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create new application: "ContextCache"
3. Copy API keys:
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

### 3.2 Configure Clerk

In Clerk Dashboard:
1. **Paths**: Set `/sign-in` and `/sign-up`
2. **Redirects**: Set `/dashboard` as after-sign-in URL
3. **Domains**: Add your production domain
4. **CORS**: Allow your frontend domain

## Part 4: Backend Deployment (Google Cloud Run)

### 4.1 Configure Project

```bash
# Set project
gcloud config set project contextcache-prod

# Enable APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

### 4.2 Create Secrets

```bash
# Create SESSION_ENCRYPTION_KEY
openssl rand -base64 32 | gcloud secrets create session-encryption-key --data-file=-

# Create API_INTERNAL_KEY
openssl rand -hex 32 | gcloud secrets create api-internal-key --data-file=-

# Create DATABASE_URL secret
echo -n "postgresql://..." | gcloud secrets create database-url --data-file=-

# Create REDIS_URL secret
echo -n "rediss://..." | gcloud secrets create redis-url --data-file=-

# Create CLERK_SECRET_KEY secret
echo -n "sk_live_..." | gcloud secrets create clerk-secret-key --data-file=-
```

### 4.3 Build and Deploy

```bash
# Build container
gcloud builds submit \
  --config cloudbuild-api.yaml \
  --substitutions=_SERVICE_NAME=contextcache-api

# Deploy to Cloud Run
gcloud run deploy contextcache-api \
  --image gcr.io/contextcache-prod/contextcache-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-secrets=\
DATABASE_URL=database-url:latest,\
REDIS_URL=redis-url:latest,\
CLERK_SECRET_KEY=clerk-secret-key:latest,\
SESSION_ENCRYPTION_KEY=session-encryption-key:latest,\
API_INTERNAL_KEY=api-internal-key:latest \
  --set-env-vars=\
NODE_ENV=production,\
PYTHON_ENV=production,\
API_PORT=8000,\
CORS_ORIGINS=https://your-frontend.pages.dev
```

### 4.4 Get Backend URL

```bash
# Get the deployed URL
gcloud run services describe contextcache-api \
  --region us-central1 \
  --format 'value(status.url)'
```

Save this URL as `BACKEND_URL` (e.g., `https://contextcache-api-xxxxx-uc.a.run.app`)

## Part 5: Frontend Deployment (Cloudflare Pages)

### 5.1 Connect Repository

1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
2. Click "Create a project"
3. Connect your GitHub repository
4. Select the `contextcache` repository

### 5.2 Configure Build Settings

**Framework preset**: Next.js

**Build command**:
```bash
cd frontend && pnpm install && pnpm build && npx @cloudflare/next-on-pages
```

**Build output directory**:
```
frontend/.vercel/output/static
```

**Root directory**: Leave empty (use monorepo root)

**Node version**: 20

### 5.3 Environment Variables

Add these in Cloudflare Pages → Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://contextcache-api-xxxxx-uc.a.run.app` | Production |
| `NEXT_PUBLIC_APP_ENV` | `production` | Production |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Production |
| `CLERK_SECRET_KEY` | `sk_live_...` | Production |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | Production |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | Production |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` | Production |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` | Production |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `false` | Production |
| `NEXT_PUBLIC_ENABLE_EXPORT` | `true` | Production |
| `NEXT_PUBLIC_ENABLE_GRAPH_VIEW` | `true` | Production |

### 5.4 Deploy

1. Click "Save and Deploy"
2. Cloudflare Pages will:
   - Clone your repository
   - Install dependencies
   - Run the build command
   - Deploy to Edge network

Your frontend will be live at: `https://contextcache.pages.dev`

### 5.5 Custom Domain (Optional)

1. Go to Pages → Custom domains
2. Add your domain (e.g., `app.contextcache.com`)
3. Follow DNS configuration instructions
4. SSL certificate will be automatically provisioned

## Part 6: Backend Custom Domain (Optional)

### 6.1 Map Custom Domain

```bash
# Map custom domain to Cloud Run
gcloud run domain-mappings create \
  --service contextcache-api \
  --domain api.contextcache.com \
  --region us-central1
```

### 6.2 Configure DNS

Add the DNS records shown by the above command to your domain registrar.

## Part 7: Post-Deployment Configuration

### 7.1 Update CORS in Backend

Update `CORS_ORIGINS` environment variable in Cloud Run:

```bash
gcloud run services update contextcache-api \
  --region us-central1 \
  --update-env-vars CORS_ORIGINS=https://contextcache.pages.dev,https://app.contextcache.com
```

### 7.2 Update Clerk Allowed Origins

In Clerk Dashboard → Settings → Allowed Origins:
- Add `https://contextcache.pages.dev`
- Add `https://app.contextcache.com` (if using custom domain)

### 7.3 Test the Deployment

1. Visit your frontend URL
2. Try signing in with Clerk
3. Create a test memory
4. Verify search works
5. Check graph visualization

## Part 8: Monitoring & Observability

### 8.1 Cloud Run Monitoring

```bash
# View logs
gcloud run services logs read contextcache-api \
  --region us-central1 \
  --limit 100

# View metrics in Cloud Console
open "https://console.cloud.google.com/run/detail/us-central1/contextcache-api/metrics"
```

### 8.2 Cloudflare Analytics

Go to Pages → Analytics to view:
- Request volume
- Cache hit rates
- Error rates
- Geographic distribution

### 8.3 Set Up Alerts

**Cloud Run**:
```bash
# Create alert for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

**Cloudflare**: Configure in Dashboard → Notifications

## Part 9: Backup & Recovery

### 9.1 Database Backups

Neon automatically creates backups. To restore:
1. Go to Neon Console → Backups
2. Select a restore point
3. Click "Restore"

### 9.2 Export User Data

```bash
# Export all data for a user
curl -X GET \
  "https://api.contextcache.com/api/export?format=json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  > user_data_backup.json
```

## Part 10: Scaling Considerations

### 10.1 Backend Scaling

```bash
# Increase max instances for high traffic
gcloud run services update contextcache-api \
  --region us-central1 \
  --max-instances 50 \
  --cpu-throttling \
  --cpu-boost
```

### 10.2 Database Scaling

Neon autoscales. Monitor usage in Console and adjust:
1. Compute size (CPU/RAM)
2. Storage limits
3. Connection pooling

### 10.3 Redis Scaling

Upstash autoscales. Monitor:
1. Memory usage
2. Connection count
3. Request latency

## Troubleshooting

### Issue: Frontend Build Fails

**Error**: "routes not configured to run with Edge Runtime"

**Solution**: Ensure all page routes have `export const runtime = 'edge';`

See `CLOUDFLARE_BUILD_FIX.md` for details.

### Issue: Backend 502 Errors

**Possible causes**:
1. Database connection issues
2. Redis unavailable
3. Memory/CPU limits exceeded

**Debug**:
```bash
gcloud run services logs read contextcache-api --region us-central1 --limit 50
```

### Issue: Clerk Authentication Not Working

**Check**:
1. Environment variables are correct
2. Allowed origins configured in Clerk
3. CORS configured correctly on backend

## Security Checklist

- [ ] All secrets stored in Secret Manager (not env vars)
- [ ] HTTPS enforced on all domains
- [ ] CORS restricted to specific origins
- [ ] Rate limiting enabled
- [ ] Database uses connection pooling
- [ ] Service accounts have minimal permissions
- [ ] Backup strategy in place
- [ ] Monitoring and alerts configured
- [ ] Security headers configured (in next.config.ts)

## Cost Estimation

Estimated monthly costs for low-to-medium traffic:

| Service | Free Tier | Estimated Cost (beyond free) |
|---------|-----------|------------------------------|
| Cloudflare Pages | 100k req/day | $0 (usually free) |
| Cloud Run | 2M req/month | $5-20/month |
| Neon Postgres | 0.5GB storage | $0-10/month |
| Upstash Redis | 10k req/day | $0-5/month |
| Clerk | 10k MAU | $25/month (Pro) |

**Total**: ~$30-60/month for small-medium scale

## Support

- Issues: https://github.com/thecontextcache/contextcache/issues
- Docs: See `/docs` folder
- Community: [Join Discord](#)

---

**Last Updated**: November 2025
**Version**: 1.0.0
