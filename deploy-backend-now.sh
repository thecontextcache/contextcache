#!/bin/bash
# Deploy Backend API to Google Cloud Run
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

echo "📦 Building and deploying to Cloud Run..."
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo ""

# Deploy using source-based deployment (easiest method)
gcloud run deploy ${SERVICE_NAME} \
  --source ./api \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8000

echo ""
echo "✅ Backend API deployed successfully!"
echo ""
echo "🧪 Testing the API..."
API_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --format 'value(status.url)')

echo "API URL: ${API_URL}"
echo ""
echo "Testing /health endpoint..."
curl -s "${API_URL}/health" | jq . || echo "(jq not installed, showing raw response)"
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Wait 30 seconds for the deployment to stabilize"
echo "  2. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)"
echo "  3. Try unlocking at https://thecontextcache.com/auth/unlock"
echo ""

