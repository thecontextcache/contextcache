'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export function ServiceUnavailable() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-xl border border-err/20 bg-panel p-8 text-center shadow-panel">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-err" />
        <h2 className="mb-2 font-display text-xl font-bold text-ink">
          Service Unavailable
        </h2>
        <p className="mb-6 text-sm text-ink-2">
          TheContextCache API is temporarily unreachable. This usually resolves
          in a few seconds.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/10 px-5 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
