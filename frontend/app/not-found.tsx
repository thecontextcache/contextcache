import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white">404</h1>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Page not found
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            The page you're looking for doesn't exist.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block px-6 py-3 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
