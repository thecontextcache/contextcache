'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center animate-fade-in-up">
      <AlertTriangle className="mb-6 h-16 w-16 text-err" />
      <h2 className="mb-2 font-display text-2xl font-bold text-ink">
        Something went wrong
      </h2>
      <p className="mb-8 text-sm text-ink-2">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/10 px-5 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
