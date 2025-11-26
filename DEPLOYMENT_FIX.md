# Cloud Run Deployment Fix

## Problem
The deployment was failing with:
```
The user-provided container failed to start and listen on the port defined provided by the PORT=8000 environment variable within the allocated timeout.
```

## Root Cause
The `QUICK_DEPLOY.sh` script was using **Cloud Run buildpacks** (`--source ./api`) instead of your **Dockerfile**. Buildpacks auto-detect the application type and build configuration, but they were not correctly detecting how to start your FastAPI application.

## Solution Applied

### 1. Updated QUICK_DEPLOY.sh
Changed from buildpack deployment to explicit Dockerfile build:

**Before:**
```bash
gcloud run deploy contextcache-api \
  --source ./api \
  ...
```

**After:**
```bash
# Build using Dockerfile
gcloud builds submit --config cloudbuild-api.yaml ...

# Deploy the built image
gcloud run deploy contextcache-api \
  --image gcr.io/${PROJECT_ID}/contextcache-api:latest \
  ...
```

### 2. Fixed api.Dockerfile
Updated to respect Cloud Run's dynamic `PORT` environment variable:

**Before:**
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**After:**
```dockerfile
ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2
```

This allows Cloud Run to dynamically assign the port.

### 3. Fixed document_service.py
Added fallback HTML parser to handle URL processing errors:

```python
try:
    soup = BeautifulSoup(response.content, "lxml")
except Exception:
    soup = BeautifulSoup(response.content, "html.parser")  # Robust fallback
```

This fixes the 500 errors when uploading URLs (like Wikipedia links).

## How to Deploy Now

### Option 1: Quick Deploy (Recommended - Now Fixed!)
```bash
./infra/cloudrun/QUICK_DEPLOY.sh
```

This now properly builds the Docker image and deploys to Cloud Run.

### Option 2: Manual Deploy
```bash
# Build the image
gcloud builds submit --config cloudbuild-api.yaml --project contextcache-prod

# Deploy to Cloud Run
gcloud run deploy contextcache-api \
  --image gcr.io/contextcache-prod/contextcache-api:latest \
  --region us-east1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,API_INTERNAL_KEY=API_INTERNAL_KEY:latest" \
  --set-env-vars "PYTHON_ENV=production,CORS_ORIGINS=https://thecontextcache.com,https://contextcache.pages.dev" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --port 8000
```

### Option 3: Use Individual Script
```bash
cd infra/cloudrun
./deploy-api.sh
```

## What Changed in This Fix

| File | Change | Reason |
|------|--------|--------|
| `infra/cloudrun/QUICK_DEPLOY.sh` | Use Dockerfile build instead of buildpacks | Buildpacks were not reliably detecting FastAPI startup |
| `infra/api.Dockerfile` | Respect `$PORT` environment variable | Cloud Run assigns port dynamically |
| `api/cc_core/services/document_service.py` | Add `html.parser` fallback | Fixes URL processing 500 errors |

## Verification Steps

After deployment, test:

1. **Health Check**
```bash
API_URL=$(gcloud run services describe contextcache-api --region us-east1 --format 'value(status.url)')
curl $API_URL/health
```

Expected: `{"status":"healthy",...}`

2. **API Docs**
```bash
open $API_URL/docs
```

Expected: FastAPI interactive docs should load

3. **Test URL Upload**
Use the frontend to upload a Wikipedia URL - should no longer throw 500 errors.

4. **Test Ask Feature**
Use the "Ask" section to query your documents - should work without errors.

## Next Steps

1. ✅ Fixed deployment script
2. ✅ Fixed Dockerfile
3. ✅ Fixed URL processing
4. ✅ Pushed changes to GitHub
5. **→ NOW: Run `./infra/cloudrun/QUICK_DEPLOY.sh` to deploy**
6. Update frontend env vars if needed:
   ```
   NEXT_PUBLIC_API_URL=<your-cloud-run-url>
   ```

## Troubleshooting

### If deployment still fails:

1. **Check Cloud Run logs:**
```bash
gcloud logging tail "resource.labels.service_name=contextcache-api" --project contextcache-prod
```

2. **Verify secrets exist:**
```bash
gcloud secrets list --project contextcache-prod
```

Required secrets:
- `DATABASE_URL`
- `REDIS_URL`
- `API_INTERNAL_KEY`

3. **Check Docker build locally:**
```bash
docker build -f infra/api.Dockerfile -t contextcache-api:test .
docker run -p 8000:8000 -e DATABASE_URL=postgresql://... contextcache-api:test
```

4. **Enable Docker buildkit (if needed):**
```bash
export DOCKER_BUILDKIT=1
```

## Common Errors Fixed

| Error | Cause | Solution |
|-------|-------|----------|
| Container failed to start | Buildpacks not detecting app | Use Dockerfile explicitly |
| Port mismatch | Hardcoded port 8000 | Use `$PORT` environment variable |
| 500 on URL upload | BeautifulSoup lxml parser failure | Add html.parser fallback |
| 500 on Ask feature | Backend not deployed / wrong URL | Deploy backend, check frontend env vars |

## Success Indicators

✅ `gcloud run deploy` completes successfully  
✅ `/health` endpoint returns `{"status":"healthy"}`  
✅ API docs accessible at `/docs`  
✅ URL uploads work without 500 errors  
✅ Ask feature works without 500 errors  
✅ 3D graph view renders (after frontend deployment)

---

**Status:** Ready to deploy ✅  
**Last Updated:** Nov 26, 2025  
**Changes Pushed:** Yes (commit e3b624b)

