'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { auth, ApiError } from '@/lib/api';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function VerifyInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError('No token provided.');
      return;
    }

    auth.verify(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/app'), 1500);
      })
      .catch((err) => {
        setStatus('error');
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Verification failed. The link may have expired.');
        }
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        {status === 'loading' && (
          <div className="animate-fade-in">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-brand" />
            <p className="text-ink-2">Verifying your sign-in link...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-fade-in-up">
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-ok" />
            <h2 className="mb-2 font-display text-xl font-bold">Signed in!</h2>
            <p className="text-sm text-ink-2">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="animate-fade-in-up">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-err" />
            <h2 className="mb-2 font-display text-xl font-bold">Verification failed</h2>
            <p className="mb-6 text-sm text-ink-2">{error}</p>
            <Link
              href="/auth"
              className="inline-flex rounded-lg border border-brand/20 bg-brand/10 px-5 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
            >
              Try again
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function VerifyContent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
