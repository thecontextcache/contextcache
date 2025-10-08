#!/bin/bash
# Run k6 load tests

echo "🔥 Starting K6 Load Tests..."

# Set API URL
export API_URL="${API_URL:-http://localhost:8000}"

echo "📡 Testing API at: $API_URL"

# Run load test
k6 run \
  --out json=load_test_results.json \
  infra/k6/load_test.js

echo "✅ Load test complete!"
echo "📊 Results saved to: load_test_results.json"