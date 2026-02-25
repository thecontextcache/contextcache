import Link from 'next/link';
import { ArrowLeft, Ghost } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center animate-fade-in-up">
      <Ghost className="mb-6 h-16 w-16 text-muted" />
      <h1 className="mb-2 font-display text-4xl font-bold gradient-text">404</h1>
      <p className="mb-8 text-lg text-ink-2">
        This page doesn&apos;t exist in any memory pack.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-violet px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-glow"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  );
}
