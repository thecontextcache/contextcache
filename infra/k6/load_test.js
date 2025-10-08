/**
 * K6 Load Test for ContextCache API
 * Tests key endpoints under load
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 50 },  // Spike to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'],              // Error rate under 10%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';

export default function () {
  // Test 1: Health check
  let healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health has status field': (r) => r.json('status') === 'healthy',
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: List projects
  let projectsRes = http.get(`${BASE_URL}/projects`);
  check(projectsRes, {
    'projects status 200': (r) => r.status === 200,
    'projects returns array': (r) => Array.isArray(r.json()),
  }) || errorRate.add(1);

  sleep(1);

  // Test 3: Create project
  const projectPayload = JSON.stringify({
    name: `Load Test Project ${Date.now()}`,
    passphrase: 'load-test-passphrase-secure-12345',
  });

  let createRes = http.post(`${BASE_URL}/projects`, projectPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const projectCreated = check(createRes, {
    'create status 200': (r) => r.status === 200,
    'create returns id': (r) => r.json('id') !== undefined,
  });

  if (!projectCreated) {
    errorRate.add(1);
    return;
  }

  const projectId = createRes.json('id');

  sleep(1);

  // Test 4: Query (if project has data)
  const queryPayload = new FormData();
  queryPayload.append('project_id', projectId);
  queryPayload.append('query', 'test query');
  queryPayload.append('limit', '5');

  let queryRes = http.post(`${BASE_URL}/query`, queryPayload.body(), {
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + queryPayload.boundary },
  });

  check(queryRes, {
    'query status 200': (r) => r.status === 200,
    'query returns results': (r) => r.json('results') !== undefined,
  }) || errorRate.add(1);

  sleep(1);

  // Test 5: Get project stats
  let statsRes = http.get(`${BASE_URL}/projects/${projectId}/stats`);
  check(statsRes, {
    'stats status 200': (r) => r.status === 200,
    'stats has counts': (r) => r.json('chunk_count') !== undefined,
  }) || errorRate.add(1);

  sleep(2);
}