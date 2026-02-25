'use client';

import { Brain, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function BrainContent() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Brain</h1>
        <p className="mt-1 text-sm text-ink-2">
          Neural graph visualization of your project knowledge.
        </p>
      </div>

      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-line bg-panel text-center">
        <div className="relative mb-6">
          <Brain className="h-20 w-20 text-brand/30" />
          <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-violet" />
        </div>
        <h2 className="mb-2 font-display text-xl font-bold">Coming soon</h2>
        <p className="mb-4 max-w-sm text-sm text-ink-2">
          The Brain view will show an interactive graph of your project knowledge —
          connections between memories, patterns, and clusters.
        </p>
        <Badge variant="violet">
          <Sparkles className="mr-1 h-3 w-3" />
          In development
        </Badge>
      </div>
    </div>
  );
}
