#!/bin/bash

# ContextCache Frontend Deployment Script
# Deploys to Cloudflare Workers using Wrangler

set -e

echo "🚀 ContextCache Frontend Deployment"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ]; then
    echo -e "${RED}❌ Error: Must run from project root${NC}"
    exit 1
fi

cd frontend

echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install --frozen-lockfile

echo ""
echo -e "${BLUE}🔍 Running linter...${NC}"
pnpm lint || echo -e "${YELLOW}⚠️  Linting warnings (continuing anyway)${NC}"

echo ""
echo -e "${BLUE}🔨 Building for Cloudflare Workers...${NC}"
pnpm run build:cloudflare

echo ""
echo -e "${BLUE}☁️  Deploying to Cloudflare...${NC}"
pnpm run deploy:cloudflare

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "1. Check your Cloudflare dashboard for the deployment URL"
echo "2. Set environment variables in Cloudflare Workers settings:"
echo "   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
echo "   - CLERK_SECRET_KEY"
echo "   - NEXT_PUBLIC_API_URL"
echo "3. Test the deployment"
echo ""

