import { chromium } from '@playwright/test';

const BASE_URL = process.env.BRAIN_PERF_BASE_URL || 'http://127.0.0.1:3000';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'contextcache_session';
const NODE_COUNT = Number(process.env.BRAIN_PERF_NODES || '10000');
const EDGE_COUNT = Number(process.env.BRAIN_PERF_EDGES || '30000');
const MIN_FPS = Number(process.env.BRAIN_MIN_FPS || '20');
const MAX_P95 = Number(process.env.BRAIN_MAX_P95_MS || '50');
const MAX_LOAD_MS = Number(process.env.BRAIN_MAX_LOAD_MS || '6000');

function parseHostFromUrl(url) {
  const u = new URL(url);
  return u.hostname;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
  });

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: 'ci-session',
      domain: parseHostFromUrl(BASE_URL),
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  const target = `${BASE_URL}/brain?synthetic=1&nodes=${NODE_COUNT}&edges=${EDGE_COUNT}`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const fatalBanner = page.locator('text=WebGL renderer failed');
  if (await fatalBanner.count()) {
    throw new Error('WebGL renderer failed and fell back to canvas during perf check');
  }

  await page.waitForFunction(() => Boolean(window.__brainGraphDebug), { timeout: 15000 });
  await wait(2500);

  const metrics = await page.evaluate(() => window.__brainGraphDebug?.getMetrics?.() ?? null);
  const snapshot = await page.evaluate(() => window.__brainGraphDebug?.getSnapshot?.() ?? null);

  if (!metrics || !snapshot) {
    throw new Error('Brain debug API is unavailable');
  }

  const failures = [];
  if (typeof metrics.fps !== 'number' || metrics.fps < MIN_FPS) {
    failures.push(`fps=${metrics.fps} below ${MIN_FPS}`);
  }
  if (typeof metrics.p95FrameMs !== 'number' || metrics.p95FrameMs > MAX_P95) {
    failures.push(`p95FrameMs=${metrics.p95FrameMs} above ${MAX_P95}`);
  }
  if (typeof metrics.loadMs !== 'number' || metrics.loadMs > MAX_LOAD_MS) {
    failures.push(`loadMs=${metrics.loadMs} above ${MAX_LOAD_MS}`);
  }
  if (!snapshot.nodeCount || snapshot.nodeCount < NODE_COUNT) {
    failures.push(`nodeCount=${snapshot.nodeCount} expected >= ${NODE_COUNT}`);
  }

  // eslint-disable-next-line no-console
  console.log('[brain-perf-check] metrics', metrics);
  // eslint-disable-next-line no-console
  console.log('[brain-perf-check] snapshot', snapshot);

  await browser.close();

  if (failures.length > 0) {
    throw new Error(`Perf check failed: ${failures.join('; ')}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[brain-perf-check] FAIL', err);
  process.exit(1);
});
