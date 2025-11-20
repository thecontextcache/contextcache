#!/bin/bash
# Deploy Backend API to Google Cloud Run using Docker
set -e

echo "🚀 Deploying ContextCache Backend API to Cloud Run"
echo ""

# Check if we're in the right directory
if [ ! -f "api/main.py" ]; then
    echo "❌ Error: Please run this script from the project root"
    echo "   cd /Users/nd/Documents/contextcache"
    exit 1
fi

# Configuration
REGION="us-east1"
SERVICE_NAME="contextcache-api"
PROJECT_ID="contextcache-prod"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "📦 Step 1: Building Docker image..."
echo "   Image: ${IMAGE_NAME}"
echo ""

# Build and push image using Cloud Build with custom Dockerfile
gcloud builds submit \
  --project ${PROJECT_ID} \
  --config cloudbuild-api-deploy.yaml \
  .

echo ""
echo "📦 Step 2: Deploying to Cloud Run..."
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo ""

# Deploy to Cloud Run with all necessary configs
# Use env-vars-file to avoid escaping issues with URLs
# Clear all env vars first, then set new ones to avoid type conflicts
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8000 \
  --project ${PROJECT_ID} \
  --clear-env-vars \
  --clear-secrets \
  --env-vars-file cloudrun.env.yaml \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest"

echo ""
echo "✅ Backend API deployed successfully!"
echo ""
echo "🧪 Testing the API..."
API_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)')

echo "API URL: ${API_URL}"
echo ""
echo "Testing /health endpoint..."
sleep 5
curl -s "${API_URL}/health" | python3 -m json.tool 2>/dev/null || curl -s "${API_URL}/health"
echo ""
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Wait 30 seconds for the deployment to stabilize"
echo "  2. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)"
echo "  3. Try unlocking at https://thecontextcache.com/auth/unlock"
echo ""

