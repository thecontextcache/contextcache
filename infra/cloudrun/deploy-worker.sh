#!/bin/bash
# Deploy Worker to Cloud Run

set -e

PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-east1"}
SERVICE_NAME="contextcache-worker"

echo "🚀 Deploying ContextCache Worker to Cloud Run..."

# Build and push image
gcloud builds submit \
  --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --project ${PROJECT_ID} \
  -f infra/worker.Dockerfile \
  ../

# Deploy to Cloud Run (as a job, not service)
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --no-allow-unauthenticated \
  --set-secrets "DATABASE_URL=database-url:latest,REDIS_PASSWORD=redis-password:latest" \
  --set-env-vars "REDIS_HOST=${REDIS_HOST}" \
  --memory 512Mi \
  --cpu 1 \
  --timeout 600 \
  --min-instances 1 \
  --max-instances 3

echo "✅ Worker deployed successfully!"