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
  --tag ${IMAGE_NAME} \
  --project ${PROJECT_ID} \
  --timeout 20m \
  --machine-type e2-highcpu-8 \
  --config - <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '${IMAGE_NAME}', '-f', 'infra/api.Dockerfile', '--target', 'production', '.']
images:
- '${IMAGE_NAME}'
EOF

echo ""
echo "📦 Step 2: Deploying to Cloud Run..."
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo ""

# Deploy to Cloud Run with all necessary configs
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
  --set-env-vars "PYTHON_ENV=production,CORS_ORIGINS=https://thecontextcache.com,https://contextcache.pages.dev,http://localhost:3000" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,CLERK_PUBLISHABLE_KEY=CLERK_PUBLISHABLE_KEY:latest"

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

