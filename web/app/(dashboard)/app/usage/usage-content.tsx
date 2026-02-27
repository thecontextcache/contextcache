'use client';

import { useEffect, useState } from 'react';
import { usage, type Usage } from '@/lib/api';
import { Card } from '@/components/ui/card';
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

  function barColor(percent: number, kind: 'brand' | 'violet' | 'ok') {
    if (percent > 80) return 'bg-err';
    if (percent > 60) return 'bg-warn';
    if (kind === 'violet') return 'bg-violet';
    if (kind === 'ok') return 'bg-ok';
    return 'bg-brand';
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-2xl font-semibold">Usage</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-6 text-2xl font-semibold">Usage</h1>
        <Card className="py-12 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-sm text-ink-2">No usage data available.</p>
        </Card>
      </div>
    );
  }

  const { limits } = data;
  const dailyMemoriesLimit = limits.daily_memories ?? limits.memories_per_day ?? 0;
  const dailyRecallLimit = limits.daily_recall_queries ?? limits.recalls_per_day ?? 0;
  const dailyProjectsLimit = limits.daily_projects ?? limits.projects_per_day ?? 0;
  const weeklyMemoriesLimit = limits.weekly_memories ?? limits.memories_per_week ?? 0;
  const weeklyRecallLimit = limits.weekly_recall_queries ?? limits.recalls_per_week ?? 0;
  const weeklyProjectsLimit = limits.weekly_projects ?? limits.projects_per_week ?? 0;

  const dailyMetrics = [
    {
      label: 'Memories created today',
      icon: Brain,
      used: data.memories_created,
      limit: dailyMemoriesLimit,
      color: 'brand' as const,
    },
    {
      label: 'Recall Queries',
      icon: Search,
      used: data.recall_queries,
      limit: dailyRecallLimit,
      color: 'violet' as const,
    },
    {
      label: 'Projects Created',
      icon: FolderOpen,
      used: data.projects_created,
      limit: dailyProjectsLimit,
      color: 'ok' as const,
    },
  ];

  const weeklyMetrics = [
    {
      label: 'Memories Created',
      icon: Brain,
      used: data.weekly_memories_created,
      limit: weeklyMemoriesLimit,
      color: 'brand' as const,
    },
    {
      label: 'Recall Queries',
      icon: Search,
      used: data.weekly_recall_queries,
      limit: weeklyRecallLimit,
      color: 'violet' as const,
    },
    {
      label: 'Projects Created',
      icon: FolderOpen,
      used: data.weekly_projects_created,
      limit: weeklyProjectsLimit,
      color: 'ok' as const,
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-ink-2">
          Your usage for <strong>{data.day}</strong> (week of {data.week_start})
        </p>
      </div>

      {/* Daily */}
      <h2 className="mb-3 text-lg font-semibold">Daily usage</h2>
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
                <span className="text-2xl font-semibold text-brand">
                  {m.used}
                </span>
                <span className="text-sm text-muted">/ {m.limit}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-2">
                <div
                  className={`h-full rounded-full transition-all ${barColor(percent, m.color)}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weekly */}
      <h2 className="mb-3 text-lg font-semibold">Weekly summary</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {weeklyMetrics.map((m) => {
          const Icon = m.icon;
          const percent = pct(m.used, m.limit);
          return (
            <Card key={m.label}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-5 w-5 text-ink-2" />
                <p className="text-sm font-medium text-ink">{m.label}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-brand">
                  {m.used}
                </span>
                <span className="text-sm text-muted">/ {m.limit}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-2">
                <div
                  className={`h-full rounded-full transition-all ${barColor(percent, m.color)}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <p className="text-sm text-ink-2">Usage tips</p>
        <p className="mt-1 text-xs text-muted">Usage resets daily at midnight UTC.</p>
      </Card>
    </div>
  );
}
