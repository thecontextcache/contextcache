#!/bin/bash
# Test deployment endpoints

echo "Testing ContextCache deployment..."
echo ""

# Test homepage
echo "1. Testing homepage (/)..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://thecontextcache.com/

# Test static asset
echo "2. Testing logo.png..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://thecontextcache.com/logo.png

# Test favicon
echo "3. Testing favicon.ico..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://thecontextcache.com/favicon.ico

# Test protected route
echo "4. Testing /dashboard..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://thecontextcache.com/dashboard

# Test _next assets
echo "5. Testing /_next/static..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://thecontextcache.com/_next/static/

echo ""
echo "Expected results:"
echo "- Homepage: 200"
echo "- Static files: 200"
echo "- Dashboard: 200 or 307/308 (redirect)"
