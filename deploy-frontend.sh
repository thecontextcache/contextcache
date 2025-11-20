#!/bin/bash
# ContextCache Frontend Deployment Script
# Deploys to Cloudflare Pages via Git integration

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

echo -e "${BLUE}📝 Deployment via Git Integration${NC}"
echo ""
echo "This will trigger automatic deployment on Cloudflare Pages."
echo "Make sure you've:"
echo "  1. Set environment variables in Cloudflare Pages dashboard"
echo "  2. Committed all your changes"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Deployment cancelled."
    exit 1
fi

echo ""
echo -e "${BLUE}📦 Checking for uncommitted changes...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes:${NC}"
    git status -s
    echo ""
    read -p "Commit changes now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " commit_msg
        git add .
        git commit -m "$commit_msg"
    else
        echo -e "${RED}❌ Please commit your changes before deploying${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${BLUE}🚀 Pushing to main branch...${NC}"
git push origin main

echo ""
echo -e "${GREEN}✅ Deployment triggered!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "1. Go to Cloudflare Pages dashboard"
echo "2. Monitor the deployment progress"
echo "3. Once complete, visit: https://thecontextcache.com"
echo ""
echo -e "${YELLOW}⚠️  Remember to set these environment variables in Cloudflare:${NC}"
echo "  - NEXT_PUBLIC_API_URL (plain text)"
echo "  - NEXT_PUBLIC_APP_ENV (plain text)"
echo "  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (plain text)"
echo "  - CLERK_SECRET_KEY (secret)"
echo ""
