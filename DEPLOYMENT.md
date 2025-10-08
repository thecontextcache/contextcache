# ContextCache Production Deployment Guide

## 🚨 Critical Changes Before Production

### 1. Environment Variables (.env.production)

**Database:**
```bash
DATABASE_URL=postgresql://user:pass@neon-host/dbname?sslmode=require
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10
Redis (Upstash):
bash# For Arq worker - need standard Redis protocol, not REST
REDIS_HOST=your-upstash-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-upstash-password
REDIS_DB=0

# For REST API (existing)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
Security:
bash# Generate with: openssl rand -hex 32
API_INTERNAL_KEY=your-production-key-here

# CORS - restrict to your domain
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
MCP Servers:
bash# Domain allowlist - production domains only
ALLOWED_DOMAINS=arxiv.org,wikipedia.org,*.edu,*.gov,yourdomain.com

2. Code Changes Required
api/cc_core/worker/settings.py:
python# UPDATE: Use environment-based Redis settings
def get_redis_settings() -> RedisSettings:
    redis_url = os.getenv("REDIS_URL")
    
    if not redis_url:
        raise ValueError("REDIS_URL must be set in production")
    
    # Parse Upstash Redis URL properly
    # Format: rediss://default:password@host:port
    
    return RedisSettings(
        host=os.getenv("REDIS_HOST"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=os.getenv("REDIS_PASSWORD"),
        database=int(os.getenv("REDIS_DB", 0)),
        ssl=True  # Upstash requires SSL
    )
api/main.py - Enable Redis Pool:
python@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing startup ...
    
    # UNCOMMENT for production:
    app.state.redis_pool = await create_pool(
        RedisSettings(
            host=os.getenv("REDIS_HOST"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            password=os.getenv("REDIS_PASSWORD"),
            ssl=True
        )
    )
    print("✅ Job queue connected")
    
    yield
    
    # Cleanup
    await app.state.redis_pool.close()
api/main.py - Enable Real Job Queue:
python@app.post("/projects/{project_id}/compute-ranking")
async def trigger_ranking(project_id: str, ...):
    # ... project validation ...
    
    # UNCOMMENT for production:
    job = await app.state.redis_pool.enqueue_job(
        'compute_ranking_task', 
        project_id
    )
    return {
        "job_id": job.job_id, 
        "status": "queued",
        "project_id": project_id
    }

3. Infrastructure Setup
Cloud Run (API):
yaml# cloudbuild.yaml or deploy script
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/contextcache-api', '-f', 'infra/api.Dockerfile', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/contextcache-api']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - gcloud
      - run
      - deploy
      - contextcache-api
      - --image=gcr.io/$PROJECT_ID/contextcache-api
      - --region=us-east1
      - --platform=managed
      - --set-env-vars=DATABASE_URL=$$DATABASE_URL,REDIS_HOST=$$REDIS_HOST
      - --set-secrets=DATABASE_URL=database-url:latest,UPSTASH_TOKEN=upstash-token:latest
Cloud Run (Worker):
bash# Deploy worker as separate service
gcloud run deploy contextcache-worker \
  --source . \
  --region us-east1 \
  --platform managed \
  --command "python run_worker.py" \
  --set-env-vars REDIS_HOST=$REDIS_HOST \
  --set-secrets DATABASE_URL=database-url:latest
Cloudflare Pages (Frontend):
bash# Build settings
Build command: pnpm build
Build output: .next
Root directory: frontend

# Environment variables
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_ENV=production

4. Database Migrations
Before first deploy:
bash# Connect to Neon
psql $DATABASE_URL

# Verify schema
\dt

# Check indexes
\di

# Verify pgvector
SELECT * FROM pg_extension WHERE extname = 'vector';

5. Security Checklist

 Change all default secrets/keys
 Enable HTTPS only (no HTTP)
 Restrict CORS to production domain
 Set up domain allowlist for document fetching
 Enable rate limiting (Upstash Redis)
 Set up monitoring (Cloud Run logs)
 Configure backup strategy for Neon
 Test recovery kit in production environment
 Enable audit logging
 Set up alerting (Sentry, etc.)


6. Monitoring & Observability
Cloud Run Metrics:

Request latency (P50, P95, P99)
Error rate
Memory usage
CPU usage

Database (Neon):

Connection pool usage
Slow queries
Storage usage

Redis (Upstash):

Queue depth
Job failure rate
Memory usage

Logs to Monitor:

API errors (500s)
Worker failures
Rate limit hits
Failed authentications


7. Performance Tuning
Database:
python# Adjust pool size based on Cloud Run instances
DATABASE_POOL_SIZE=5  # per instance
DATABASE_MAX_OVERFLOW=10
Worker:
python# Tune based on job complexity
max_jobs = 5  # concurrent jobs per worker
job_timeout = 600  # 10 minutes for heavy tasks
Embeddings:

Consider caching frequent queries
Batch operations where possible
Use smaller model if latency is critical


8. Backup & Recovery
Automated Backups:

Neon: Enable automated snapshots (daily)
Export Memory Packs weekly
Store recovery kits encrypted in GCS

Disaster Recovery:

Neon restore from snapshot
Redeploy Cloud Run services
Import Memory Packs if needed
Verify audit chains


9. CI/CD Pipeline
GitHub Actions (.github/workflows/deploy.yml):
yamlname: Deploy Production

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Run tests
      - name: Run tests
        run: |
          cd api && pip install -r requirements.txt
          pytest
      
      # Build and deploy API
      - name: Deploy API
        run: |
          gcloud run deploy contextcache-api ...
      
      # Deploy worker
      - name: Deploy Worker
        run: |
          gcloud run deploy contextcache-worker ...
      
      # Deploy frontend
      - name: Deploy Frontend
        run: |
          cd frontend && pnpm build
          # Cloudflare Pages auto-deploys on push

10. Cost Optimization
Free Tier Limits:

Neon: 0.5GB storage, 3GB transfer
Upstash: 10k commands/day
Cloud Run: 2M requests/month
Cloudflare Pages: Unlimited

Scaling Strategy:

Start with free tiers
Monitor usage
Upgrade selectively (Neon first, then Redis)
Consider Cloud Run min instances only when needed


🚀 Deployment Steps
Initial Deploy:
bash# 1. Set up secrets in GCP
gcloud secrets create database-url --data-file=.env.production

# 2. Deploy API
cd api
gcloud run deploy contextcache-api --source .

# 3. Deploy Worker
gcloud run deploy contextcache-worker --source . --command "python run_worker.py"

# 4. Deploy Frontend
cd ../frontend
# Cloudflare Pages: Connect GitHub repo, auto-deploys

# 5. Verify
curl https://api.yourdomain.com/health
Update Deploy:
bash# Tag release
git tag v0.1.0
git push origin v0.1.0

# GitHub Actions auto-deploys

✅ Post-Deployment Checklist

 API health check returns 200
 Frontend loads and connects to API
 Can create project
 Can upload document
 Can query and get results
 Worker processes jobs
 Audit chain verifies
 Memory Pack export works
 Recovery kit generates
 Rate limiting active
 Monitoring dashboards set up
 Backups configured
 DNS configured
 SSL certificates active


🆘 Rollback Plan
If deployment fails:
bash# Rollback Cloud Run to previous revision
gcloud run services update-traffic contextcache-api --to-revisions=PREVIOUS=100

# Rollback database if needed
# (Neon restore from snapshot)

# Rollback frontend
# (Cloudflare Pages rollback in dashboard)

📞 Support Contacts

Neon Support: https://neon.tech/docs
Upstash Support: https://upstash.com/docs
Cloud Run Docs: https://cloud.google.com/run/docs
Cloudflare Pages: https://developers.cloudflare.com/pages