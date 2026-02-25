'use client';

import { useEffect, useState } from 'react';
import { usage, type Usage } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { BarChart3, Brain, Search, FolderOpen } from 'lucide-react';

export function UsageContent() {
  const { toast } = useToast();
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage() {
    try {
      const d = await usage.me();
      setData(d);
    } catch {
      toast('error', 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }

  function pct(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 font-display text-2xl font-bold">Usage</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 font-display text-2xl font-bold">Usage</h1>
        <Card className="py-12 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-sm text-ink-2">No usage data available.</p>
        </Card>
      </div>
    );
  }

  const { limits } = data;

  const dailyMetrics = [
    {
      label: 'Memories created today',
      icon: Brain,
      used: data.memories_created,
      limit: limits.memories_per_day,
    },
    {
      label: 'Recall queries today',
      icon: Search,
      used: data.recall_queries,
      limit: limits.recalls_per_day,
    },
    {
      label: 'Projects created today',
      icon: FolderOpen,
      used: data.projects_created,
      limit: limits.projects_per_day,
    },
  ];

  const weeklyMetrics = [
    {
      label: 'Weekly memories',
      icon: Brain,
      used: data.weekly_memories_created,
      limit: limits.memories_per_week,
    },
    {
      label: 'Weekly recalls',
      icon: Search,
      used: data.weekly_recall_queries,
      limit: limits.recalls_per_week,
    },
    {
      label: 'Weekly projects',
      icon: FolderOpen,
      used: data.weekly_projects_created,
      limit: limits.projects_per_week,
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Usage</h1>
        <p className="mt-1 text-sm text-ink-2">
          Your usage for <strong>{data.day}</strong> (week of {data.week_start})
        </p>
      </div>

      {/* Daily */}
      <h2 className="mb-3 text-lg font-semibold">Today</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dailyMetrics.map((m) => {
          const Icon = m.icon;
          const percent = pct(m.used, m.limit);
          return (
            <Card key={m.label}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-5 w-5 text-brand" />
                <p className="text-sm font-medium text-ink">{m.label}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold gradient-text">
                  {m.used}
                </span>
                <span className="text-sm text-muted">/ {m.limit}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    percent >= 90 ? 'bg-err' : percent >= 70 ? 'bg-warn' : 'bg-brand'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weekly */}
      <h2 className="mb-3 text-lg font-semibold">This week</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {weeklyMetrics.map((m) => {
          const Icon = m.icon;
          const percent = pct(m.used, m.limit);
          return (
            <Card key={m.label}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-5 w-5 text-violet" />
                <p className="text-sm font-medium text-ink">{m.label}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold gradient-text">
                  {m.used}
                </span>
                <span className="text-sm text-muted">/ {m.limit}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    percent >= 90 ? 'bg-err' : percent >= 70 ? 'bg-warn' : 'bg-violet'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
