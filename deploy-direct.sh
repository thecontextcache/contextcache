#!/bin/bash
# Direct deployment script using Wrangler

echo "🚀 ContextCache - Direct Worker Deployment"
echo ""
echo "This script deploys directly to Cloudflare Workers (bypassing Pages)"
echo ""

# Navigate to frontend
cd frontend

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build
echo "🔨 Building application..."
pnpm run build:cloudflare

# Check if build succeeded
if [ ! -f ".open-next/worker.js" ]; then
    echo "❌ Build failed - worker.js not found"
    exit 1
fi

echo "✅ Build complete"
echo ""

# Check if wrangler.toml exists in root
if [ ! -f "../wrangler.toml" ]; then
    echo "❌ wrangler.toml not found in root"
    exit 1
fi

echo "📤 Deploying to Cloudflare Workers..."
echo ""

# Deploy using wrangler
cd ..
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Visit: https://thecontextcache.com"
