#!/bin/bash
# Quick CORS fix for ContextCache API
set -e

echo "🔧 Fixing CORS for ContextCache API"
echo ""
echo "This will update the API to allow requests from:"
echo "  - https://thecontextcache.com"
echo "  - https://contextcache.pages.dev"
echo "  - https://*.contextcache.pages.dev"
echo "  - http://localhost:3000"
echo ""

# Set CORS origins
CORS_ORIGINS="https://thecontextcache.com,https://contextcache.pages.dev,https://*.contextcache.pages.dev,http://localhost:3000"

echo "Updating Cloud Run service..."
gcloud run services update contextcache-api \
  --region us-east1 \
  --update-env-vars "CORS_ORIGINS=${CORS_ORIGINS}"

echo ""
echo "✅ CORS updated successfully!"
echo ""
echo "Wait ~30 seconds for the change to take effect, then try unlocking again."
echo ""

