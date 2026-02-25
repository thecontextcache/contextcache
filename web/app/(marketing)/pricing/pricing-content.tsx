'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PRICING_TIERS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronDown, ArrowRight } from 'lucide-react';

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button
        className="flex w-full items-center justify-between py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium text-ink">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="text-sm text-ink-2 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function PricingContent() {
  const faqs = [
    { q: 'Is the alpha really free?', a: 'Yes. During the invite-only alpha, all features are free. We\'ll give plenty of notice before introducing paid tiers.' },
    { q: 'What happens when I hit a limit?', a: 'You\'ll get a clear error message. We\'ll never silently drop your data. Upgrade options will be available when paid tiers launch.' },
    { q: 'Can I self-host and avoid paying?', a: 'TheContextCache is designed to be self-hosted. The pricing tiers are for the managed service (coming later). Self-hosted is always free.' },
    { q: 'Do you offer annual billing?', a: 'Not yet. Annual billing with a discount will be available when paid tiers launch.' },
  ];

  return (
    <div className="animate-fade-in px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <Badge className="mb-4">Simple pricing</Badge>
          <h1 className="mb-4 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
            <span className="gradient-text">Choose your plan</span>
          </h1>
          <p className="mx-auto max-w-xl text-ink-2">
            Start free during the alpha. Upgrade when you need more.
          </p>
        </div>

        {/* Tiers grid */}
        <div className="mb-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 transition-all duration-200 ${
                tier.active
                  ? 'border-brand/30 bg-panel shadow-glow'
                  : 'border-line bg-panel hover:border-line'
              }`}
            >
              {tier.active && (
                <Badge variant="brand" className="absolute -top-2.5 left-4">
                  Current
                </Badge>
              )}
              <h3 className="mb-1 font-display text-lg font-bold">{tier.name}</h3>
              <p className="mb-4 text-xs text-muted">{tier.description}</p>
              <div className="mb-6">
                <span className="font-display text-3xl font-bold gradient-text">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm text-muted">{tier.period}</span>
                )}
              </div>
              <ul className="mb-6 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.active ? (
                <Link
                  href="/auth"
                  className="block rounded-lg bg-gradient-to-r from-brand to-violet py-2.5 text-center text-sm font-medium text-white transition-all hover:shadow-glow"
                >
                  Get started
                </Link>
              ) : (
                <div className="rounded-lg border border-line bg-bg-2 py-2.5 text-center text-sm text-muted">
                  Coming soon
                </div>
              )}
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold">
            Pricing FAQ
          </h2>
          <div className="divide-y divide-line rounded-xl border border-line bg-panel p-6">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <Link
            href="/waitlist"
            className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-violet px-7 py-3 text-sm font-medium text-white shadow-glow transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.5)]"
          >
            Join the waitlist
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
