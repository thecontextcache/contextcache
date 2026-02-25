'use client';

import { useState } from 'react';
import { waitlist, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Sparkles } from 'lucide-react';

export function WaitlistContent() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [useCase, setUseCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await waitlist.join({
        email,
        name: name || undefined,
        company: company || undefined,
        use_case: useCase || undefined,
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="animate-fade-in-up flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <CheckCircle className="mx-auto mb-6 h-16 w-16 text-ok" />
          <h2 className="mb-2 font-display text-2xl font-bold">You&apos;re on the list!</h2>
          <p className="text-ink-2">
            We&apos;ll send you an invite when a spot opens up. Keep an eye on <strong className="text-ink">{email}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <Badge className="mb-4">
            <Sparkles className="mr-1 h-3 w-3" />
            Invite-only alpha
          </Badge>
          <h1 className="mb-2 font-display text-3xl font-bold">
            <span className="gradient-text">Join the waitlist</span>
          </h1>
          <p className="text-sm text-ink-2">
            Get early access to TheContextCache. We&apos;re onboarding teams weekly.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-line bg-panel p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
              Email <span className="text-err">*</span>
            </label>
            <Input
              id="email"
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
              Name
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-ink">
              Company
            </label>
            <Input
              id="company"
              type="text"
              placeholder="Acme Inc."
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="useCase" className="mb-1.5 block text-sm font-medium text-ink">
              How will you use it?
            </label>
            <Input
              id="useCase"
              type="text"
              placeholder="Keeping AI context across sprints..."
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-err/20 bg-err/10 px-4 py-2.5 text-sm text-err">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Join the waitlist
          </Button>
        </form>
      </div>
    </div>
  );
}
