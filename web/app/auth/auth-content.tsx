'use client';

import { useState } from 'react';
import Link from 'next/link';
import { auth, ApiError } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, CheckCircle, AlertTriangle } from 'lucide-react';

export function AuthContent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setError('Please accept the terms of service.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await auth.requestLink(email);
      setSent(true);
      if (res.debug_link) {
        setDebugLink(res.debug_link);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError('This email is not on the invite list. Join the waitlist for access.');
        } else if (err.status === 429) {
          setError('Too many attempts. Please try again in a minute.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Network error. Is the API running?');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="animate-fade-in-up flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <CheckCircle className="mx-auto mb-6 h-16 w-16 text-ok" />
          <h2 className="mb-2 font-display text-2xl font-bold">Check your email</h2>
          <p className="mb-4 text-ink-2">
            We sent a sign-in link to <strong className="text-ink">{email}</strong>.
            Click the link to sign in.
          </p>
          {debugLink && (
            <div className="mt-6 rounded-lg border border-warn/20 bg-warn/10 p-4">
              <p className="mb-2 text-xs font-medium text-warn">Dev mode — magic link:</p>
              <a
                href={debugLink}
                className="break-all text-xs text-brand underline"
              >
                {debugLink}
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-2xl font-bold gradient-text">
            Sign in to {APP_NAME}
          </h1>
          <p className="text-sm text-ink-2">
            Enter your email and we&apos;ll send you a magic link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-line bg-panel p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="email"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line bg-bg-2 accent-brand"
            />
            <span className="text-xs text-ink-2">
              I agree to the{' '}
              <Link href="/legal" className="text-brand underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/legal" className="text-brand underline">
                Privacy Policy
              </Link>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-err/20 bg-err/10 px-4 py-2.5 text-sm text-err">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Send me a sign-in link
          </Button>

          <p className="text-center text-xs text-muted">
            Don&apos;t have an invite?{' '}
            <Link href="/waitlist" className="text-brand underline">
              Join the waitlist
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
