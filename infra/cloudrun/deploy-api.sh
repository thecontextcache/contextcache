#!/bin/bash
# Deploy API to Cloud Run

set -e

PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-east1"}
SERVICE_NAME="contextcache-api"

echo "🚀 Deploying ContextCache API to Cloud Run..."

# Build and push image
gcloud builds submit \
  --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --project ${PROJECT_ID} \
  -f infra/api.Dockerfile \
  ../

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --set-env-vars "CORS_ORIGINS=${CORS_ORIGINS}" \
  --set-secrets "DATABASE_URL=database-url:latest,UPSTASH_REDIS_REST_TOKEN=upstash-token:latest" \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10

echo "✅ API deployed successfully!"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)')

echo "🌐 API URL: ${SERVICE_URL}"