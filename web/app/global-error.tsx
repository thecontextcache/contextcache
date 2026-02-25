'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-[#060C18] text-[#E2EEF9] antialiased">
        <div className="mx-4 max-w-md text-center">
          <AlertTriangle className="mx-auto mb-6 h-16 w-16 text-[#FF3B6E]" />
          <h2 className="mb-2 text-2xl font-bold">Critical Error</h2>
          <p className="mb-8 text-sm text-[#94ADC8]">
            Something went seriously wrong. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="rounded-lg border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-5 py-2.5 text-sm font-medium text-[#00D4FF]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
