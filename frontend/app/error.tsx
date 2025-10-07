'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type AppError = Error & { digest?: string };

export default function Error({
  error,
  reset,
}: {
  error: AppError;
  reset: () => void;
}) {
  useEffect(() => {
    // Useful for debugging in dev / logging in prod
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div aria-hidden className="text-6xl">⚠️</div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {error?.message ?? 'An unexpected error occurred'}
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => reset()}
            className="w-full px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition"
          >
            Try again
          </button>

          <Link
            href="/"
            className="block w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-900 dark:text-white text-center"
          >
            Go home
          </Link>
        </div>

        {error?.digest && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
