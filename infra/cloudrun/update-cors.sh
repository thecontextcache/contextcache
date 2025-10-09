#!/bin/bash
# Update CORS settings for the API after frontend is deployed

set -e

PROJECT_ID="contextcache-prod"
REGION="us-east1"

echo "🔧 Update CORS Settings for ContextCache API"
echo ""
echo "Enter your frontend URL (from Cloudflare Pages):"
echo "Example: https://contextcache.pages.dev"
read -p "Frontend URL: " FRONTEND_URL

if [ -z "$FRONTEND_URL" ]; then
    echo "❌ Frontend URL cannot be empty!"
    exit 1
fi

echo ""
echo "Updating CORS to allow: ${FRONTEND_URL}"

gcloud run services update contextcache-api \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --set-env-vars "CORS_ORIGINS=${FRONTEND_URL},http://localhost:3000"

echo ""
echo "✅ CORS updated successfully!"
echo ""
echo "Your API now accepts requests from:"
echo "  - ${FRONTEND_URL}"
echo "  - http://localhost:3000 (for local dev)"


