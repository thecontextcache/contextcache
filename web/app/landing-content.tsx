'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Zap,
  Shield,
  Terminal,
  Layers,
  Search,
  Lock,
  Server,
  ChevronDown,
  ArrowRight,
  Clock,
  Database,
  GitBranch,
} from 'lucide-react';

/* ── Intersection Observer for scroll-triggered animations ─── */
function FadeInSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── FAQ Accordion Item ─────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button
        className="flex w-full items-center justify-between py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium text-ink sm:text-base">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-ink-2 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Terminal Demo ──────────────────────────────────────────── */
function TerminalDemo() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-2 shadow-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-err/60" />
        <div className="h-3 w-3 rounded-full bg-warn/60" />
        <div className="h-3 w-3 rounded-full bg-ok/60" />
        <span className="ml-2 text-xs text-muted font-mono">recall.sh</span>
      </div>
      <div className="p-4 font-mono text-xs leading-relaxed sm:text-sm">
        <p className="text-muted">$ curl -s http://localhost:8000/api/projects/1/recall \</p>
        <p className="text-muted">  -H &quot;X-API-Key: cck_abc123&quot; \</p>
        <p className="text-muted">  -G --data-urlencode &quot;query=auth architecture&quot;</p>
        <p className="mt-3 text-ok">{'{'}</p>
        <p className="text-ink pl-4">&quot;project&quot;: &quot;webapp&quot;,</p>
        <p className="text-ink pl-4">&quot;query&quot;: &quot;auth architecture&quot;,</p>
        <p className="text-ink pl-4">&quot;memories&quot;: [</p>
        <p className="text-brand pl-8">{'{'} &quot;type&quot;: &quot;decision&quot;, &quot;title&quot;: &quot;Use magic-link auth&quot; {'}'},</p>
        <p className="text-violet pl-8">{'{'} &quot;type&quot;: &quot;finding&quot;, &quot;title&quot;: &quot;Session cookies &gt; JWTs&quot; {'}'},</p>
        <p className="text-warn pl-8">{'{'} &quot;type&quot;: &quot;note&quot;, &quot;title&quot;: &quot;Rate-limit /auth to 5/min&quot; {'}'}</p>
        <p className="text-ink pl-4">],</p>
        <p className="text-ink pl-4">&quot;recall_ms&quot;: <span className="text-ok">4.2</span></p>
        <p className="text-ok">{'}'}</p>
      </div>
    </div>
  );
}

/* ── Main Landing Content ───────────────────────────────────── */
export function LandingContent() {
  const features = [
    { icon: Brain, title: 'Contextual Memory', desc: 'Store decisions, findings, snippets, and notes as structured memory cards.' },
    { icon: Zap, title: 'Instant Recall', desc: 'Sub-10ms recall with token overlap scoring and recency weighting.' },
    { icon: Terminal, title: 'CLI & Extensions', desc: 'Push memories from your terminal, VS Code, or Chrome extension.' },
    { icon: Layers, title: 'Memory Packs', desc: 'Get a formatted pack ready to paste into ChatGPT, Claude, or Cursor.' },
    { icon: Shield, title: 'Self-Hosted', desc: 'Run on your infra. No data leaves your network. No telemetry.' },
    { icon: Search, title: 'Full-Text Search', desc: 'PostgreSQL-powered search across all your project knowledge.' },
  ];

  const steps = [
    { num: '01', title: 'Publish', desc: 'Push memory cards via CLI, API, or browser extension as you work.' },
    { num: '02', title: 'Recall', desc: 'Query your project brain — get relevant memories in milliseconds.' },
    { num: '03', title: 'Paste', desc: 'Drop the memory pack into any AI chat for perfect context.' },
  ];

  const stats = [
    { value: '<10ms', label: 'Recall latency' },
    { value: '6', label: 'Memory types' },
    { value: '100%', label: 'Self-hosted' },
    { value: '0', label: 'External deps' },
  ];

  const faqs = [
    { q: 'What is a memory card?', a: 'A memory card is a structured piece of project knowledge — a decision, finding, snippet, note, issue, or context. Each card has a type, title, body, and optional tags.' },
    { q: 'How is this different from a wiki?', a: 'Wikis are for humans to read. TheContextCache is optimized for AI consumption. Memory packs are formatted and sized specifically for LLM context windows.' },
    { q: 'Can I self-host this?', a: 'Yes — that\'s the only way to run it. TheContextCache is a Docker Compose stack with PostgreSQL, a Python API, and a Next.js frontend. No cloud dependency.' },
    { q: 'Is there a free tier?', a: 'The alpha is completely free. We\'re invite-only right now — join the waitlist and we\'ll send you access.' },
    { q: 'What AI tools does this work with?', a: 'Any LLM that accepts text input: ChatGPT, Claude, Cursor, GitHub Copilot, etc. You just paste the memory pack into your prompt.' },
    { q: 'What about embeddings/vector search?', a: 'Not yet. The MVP uses token overlap + recency scoring which is fast and surprisingly effective. Vector search is on the roadmap.' },
  ];

  return (
    <div className="animate-fade-in">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pt-32 lg:pt-40">
        {/* Background gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-80 w-80 rounded-full bg-brand/5 blur-[100px]" />
          <div className="absolute -top-20 right-1/4 h-60 w-60 rounded-full bg-violet/5 blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <Badge className="mb-6 animate-fade-in-up">
            Invite-only alpha — now live
          </Badge>

          <h1 className="mb-6 font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            <span className="gradient-text">TheContextCache</span>
          </h1>
          <p className="mx-auto mb-4 max-w-2xl text-xl text-ink-2 sm:text-2xl">
            Project Brain for AI Teams
          </p>
          <p className="mx-auto mb-10 max-w-xl text-sm text-muted sm:text-base">
            Publish your project decisions, findings, and notes as memory cards.
            Recall them instantly and paste into any AI chat.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/waitlist"
              className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-violet px-7 py-3 text-sm font-medium text-white shadow-glow transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.5)]"
            >
              Join the waitlist
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-7 py-3 text-sm font-medium text-ink transition-all hover:border-brand/30 hover:bg-bg-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Terminal Demo ─────────────────────────────────── */}
      <FadeInSection className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <TerminalDemo />
      </FadeInSection>

      {/* ── How It Works ──────────────────────────────────── */}
      <FadeInSection>
        <section className="border-y border-line bg-bg-2/50 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center font-display text-2xl font-bold sm:text-3xl">
              How it works
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.num} className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand/10 font-display text-xl font-bold text-brand">
                    {step.num}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-ink">{step.title}</h3>
                  <p className="text-sm text-ink-2">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* ── Features ──────────────────────────────────────── */}
      <FadeInSection>
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center font-display text-2xl font-bold sm:text-3xl">
              Everything you need
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-line bg-panel p-6 transition-all duration-200 hover:border-brand/20 hover:shadow-glow"
                  >
                    <Icon className="mb-4 h-8 w-8 text-brand" />
                    <h3 className="mb-2 font-semibold text-ink">{f.title}</h3>
                    <p className="text-sm text-ink-2">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* ── Memory Types ──────────────────────────────────── */}
      <FadeInSection>
        <section className="border-y border-line bg-bg-2/50 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-8 text-center font-display text-2xl font-bold sm:text-3xl">
              Six memory types
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { label: 'Decision', color: 'bg-brand/10 text-brand border-brand/20' },
                { label: 'Finding', color: 'bg-violet/10 text-violet border-violet/20' },
                { label: 'Snippet', color: 'bg-ok/10 text-ok border-ok/20' },
                { label: 'Note', color: 'bg-warn/10 text-warn border-warn/20' },
                { label: 'Issue', color: 'bg-err/10 text-err border-err/20' },
                { label: 'Context', color: 'bg-ink-2/10 text-ink-2 border-ink-2/20' },
              ].map((t) => (
                <span
                  key={t.label}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${t.color}`}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* ── Stats ─────────────────────────────────────────── */}
      <FadeInSection>
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-display text-3xl font-bold gradient-text sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1 text-sm text-ink-2">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      </FadeInSection>

      {/* ── Trust Strip ───────────────────────────────────── */}
      <FadeInSection>
        <section className="border-y border-line bg-bg-2/50 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Server, title: 'Self-hosted', desc: 'Runs on your infrastructure' },
                { icon: Lock, title: 'No telemetry', desc: 'Zero tracking or analytics' },
                { icon: GitBranch, title: 'Open protocol', desc: 'Standard REST API' },
                { icon: Clock, title: 'Invite-only', desc: 'Quality over quantity' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div>
                      <div className="text-sm font-medium text-ink">{item.title}</div>
                      <div className="text-xs text-muted">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <FadeInSection>
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-8 text-center font-display text-2xl font-bold sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-panel p-6">
              {faqs.map((faq) => (
                <FaqItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        </section>
      </FadeInSection>

      {/* ── Final CTA ─────────────────────────────────────── */}
      <FadeInSection>
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-panel p-8 text-center sm:p-12">
            <Database className="mx-auto mb-4 h-10 w-10 text-brand" />
            <h2 className="mb-3 font-display text-2xl font-bold sm:text-3xl">
              Ready to give your AI team a brain?
            </h2>
            <p className="mb-8 text-ink-2">
              Join the alpha and start building your project memory.
            </p>
            <Link
              href="/waitlist"
              className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-violet px-7 py-3 text-sm font-medium text-white shadow-glow transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.5)]"
            >
              Join the waitlist
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </FadeInSection>
    </div>
  );
}
