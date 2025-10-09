#!/bin/bash
# Quick Deploy Script for ContextCache to Google Cloud Run
# This script deploys both API and Worker services

set -e

# ============================================================================
# CONFIGURATION - Update these values!
# ============================================================================

PROJECT_ID="contextcache-prod"  # Your GCP project ID
REGION="us-east1"              # Deployment region
FRONTEND_URL="https://your-app.pages.dev"  # Update after Cloudflare deployment

# ============================================================================
# Colors for output
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper functions
# ============================================================================

print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# Pre-flight checks
# ============================================================================

print_step "Running pre-flight checks..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI not found. Install it first:"
    echo "  brew install google-cloud-sdk"
    exit 1
fi

# Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    print_error "Not authenticated with gcloud. Run:"
    echo "  gcloud auth login"
    exit 1
fi

# Set project
print_step "Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Check if we're in the right directory
if [ ! -f "infra/cloudrun/QUICK_DEPLOY.sh" ]; then
    print_error "Please run this script from the project root:"
    echo "  cd /Users/nd/Documents/contextcache"
    echo "  ./infra/cloudrun/QUICK_DEPLOY.sh"
    exit 1
fi

print_success "Pre-flight checks passed!"
echo ""

# ============================================================================
# Deploy API Service
# ============================================================================

print_step "Deploying API Service..."

gcloud run deploy contextcache-api \
  --source ./api \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,API_INTERNAL_KEY=API_INTERNAL_KEY:latest" \
  --set-env-vars "PYTHON_ENV=production,CORS_ORIGINS=*" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --port 8000

print_success "API deployed!"
echo ""

# ============================================================================
# Deploy Worker Service
# ============================================================================

print_step "Deploying Worker Service..."

gcloud run deploy contextcache-worker \
  --source ./api \
  --region ${REGION} \
  --platform managed \
  --no-allow-unauthenticated \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest" \
  --set-env-vars "PYTHON_ENV=production,WORKER_CONCURRENCY=4" \
  --min-instances 1 \
  --max-instances 5 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --command "python" \
  --args "run_worker.py"

print_success "Worker deployed!"
echo ""

# ============================================================================
# Get Service URLs
# ============================================================================

print_step "Retrieving service URLs..."

API_URL=$(gcloud run services describe contextcache-api \
  --region ${REGION} \
  --format 'value(status.url)')

print_success "Deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Your application is now live!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}API URL:${NC} ${API_URL}"
echo ""
echo "Test your API:"
echo "  curl ${API_URL}/health"
echo ""
echo "View logs:"
echo "  gcloud logging tail \"resource.labels.service_name=contextcache-api\""
echo ""
echo "Next steps:"
echo "  1. Update Cloudflare Pages env var: NEXT_PUBLIC_API_URL=${API_URL}"
echo "  2. Update CORS: ./infra/cloudrun/update-cors.sh"
echo "  3. Test API docs: ${API_URL}/docs"
echo ""


