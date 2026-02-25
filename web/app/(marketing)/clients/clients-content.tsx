'use client';

import { Badge } from '@/components/ui/badge';
import { Terminal, Code, Globe, ArrowRight, Copy, Check } from 'lucide-react';
import { useState } from 'react';

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-2 px-4 py-3 font-mono text-sm">
      <span className="text-muted">$</span>
      <code className="flex-1 text-ink">{command}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded p-1 text-muted transition-colors hover:text-ink"
      >
        {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ClientsContent() {
  const clients = [
    {
      icon: Terminal,
      title: 'CLI',
      description: 'Push and recall memories from your terminal. Works with any shell.',
      status: 'Available',
      statusVariant: 'ok' as const,
      install: 'pip install contextcache-cli',
      docs: 'Supports push, recall, list, and configure commands.',
    },
    {
      icon: Code,
      title: 'VS Code Extension',
      description: 'Access your project brain directly from your editor.',
      status: 'Coming soon',
      statusVariant: 'warn' as const,
      install: null,
      docs: 'Push selections as memory cards. Recall context without leaving your editor.',
    },
    {
      icon: Globe,
      title: 'Chrome Extension',
      description: 'Save findings from the web as memory cards.',
      status: 'Coming soon',
      statusVariant: 'warn' as const,
      install: null,
      docs: 'Highlight text on any page and save it as a finding or note.',
    },
  ];

  return (
    <div className="animate-fade-in px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <Badge className="mb-4">Integrations</Badge>
          <h1 className="mb-4 font-display text-3xl font-bold sm:text-4xl">
            <span className="gradient-text">Download clients</span>
          </h1>
          <p className="mx-auto max-w-xl text-ink-2">
            Connect to TheContextCache from your favourite tools.
          </p>
        </div>

        <div className="space-y-6">
          {clients.map((client) => {
            const Icon = client.icon;
            return (
              <div
                key={client.title}
                className="rounded-xl border border-line bg-panel p-6 transition-all duration-200 hover:border-brand/20"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                    <Icon className="h-6 w-6 text-brand" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-ink">{client.title}</h3>
                      <Badge variant={client.statusVariant}>{client.status}</Badge>
                    </div>
                    <p className="mb-3 text-sm text-ink-2">{client.description}</p>
                    <p className="mb-4 text-xs text-muted">{client.docs}</p>
                    {client.install && <CopyCommand command={client.install} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* API section */}
        <div className="mt-12 rounded-xl border border-line bg-panel p-6 text-center">
          <h3 className="mb-2 font-display text-lg font-bold">REST API</h3>
          <p className="mb-4 text-sm text-ink-2">
            Build your own integration with the full REST API.
          </p>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm text-brand transition-colors hover:text-brand/80"
          >
            Check API health
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
