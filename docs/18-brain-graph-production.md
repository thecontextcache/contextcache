# Brain Graph Production Checklist

This document turns the Brain Graph research brief into enforceable implementation gates.

## Targets

- Renderer default: `Sigma/WebGL` with worker-backed layout.
- Fallback: `Canvas` when WebGL init/context fails.
- Scale target: `10,000` nodes, `30,000+` edges.

## Performance SLOs

- Mean FPS during pan/zoom/filter: `>= 30`
- p5 FPS: `>= 20`
- p95 frame time: `<= 33ms` (hard fail `> 50ms`)
- Click-to-highlight p95: `<= 100ms`
- Search-to-focus p95: `<= 200ms`
- TTI: `<= 2s` @1k, `<= 4s` @10k (hard fail `> 6s`)

## Implemented In App

- WebGL renderer path with Sigma + Graphology.
- Worker simulation from `web/app/(dashboard)/brain/brain-sim.worker.ts`.
- Auto fallback to Canvas when WebGL init/context fails.
- Keyboard controls: pan, zoom, reset, tab-cycle, select, escape.
- Basic mobile-safe list fallback for low-memory small-screen devices.
- Debug API: `window.__brainGraphDebug`.

## Remaining Validation Steps

1. Run synthetic mode with query params:
   - `/brain?synthetic=1&nodes=1000&edges=2000`
   - `/brain?synthetic=1&nodes=3000&edges=8000`
   - `/brain?synthetic=1&nodes=5000&edges=15000`
   - `/brain?synthetic=1&nodes=10000&edges=30000`
2. Capture metrics from browser console:
   - `window.__brainGraphDebug.getMetrics()`
   - `window.__brainGraphDebug.getSnapshot()`
3. Record Chrome Performance traces for:
   - Idle baseline (30s)
   - Pan/zoom stress (60s)
   - Filter toggles (60s)
   - Search burst (60s)
4. Confirm no sustained long tasks `> 50ms`.
5. Confirm no monotonic heap growth over 10-minute soak.

## Automated Perf Smoke

Run locally from `web/`:

```bash
npm install
npx playwright install --with-deps chromium
NEXT_PUBLIC_BRAIN_RENDERER=webgl npm run build
NEXT_PUBLIC_BRAIN_RENDERER=webgl npm run start
# in another terminal
npm run perf:brain
```

The perf smoke script opens synthetic 10k/30k mode and validates:

- renderer is available
- debug API responds
- fps / p95 frame / load-time are within configured bounds

## Deploy Controls

- Set one env value only:
  - `NEXT_PUBLIC_BRAIN_RENDERER=webgl`
- Keep Canvas fallback code deployed.
- If WebGL errors appear, keep service live via fallback and investigate with:
  - browser console
  - `docker compose ... logs web`

## Incident Playbook

If Brain fails in production:

1. Verify fallback banner appears and Canvas loads.
2. Capture `window.__brainGraphDebug.getMetrics()`.
3. Capture WebGL errors from console.
4. Hotfix by forcing renderer:
   - `NEXT_PUBLIC_BRAIN_RENDERER=canvas`
5. Redeploy and continue investigation.
