'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getUsageStatsAction } from '@/app/actions';
import {
  ActivityIcon,
  CoinsIcon,
  ZapIcon,
  CpuIcon,
  RefreshCwIcon,
} from 'lucide-react';

type Period = 'today' | 'week' | 'month';

interface UsageStats {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  byModel: Record<string, { calls: number; tokens: number; cost: number }>;
  bySource: Record<string, { calls: number; tokens: number; cost: number }>;
  byDay: Array<{ date: string; tokens: number; cost: number; calls: number }>;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function StatCard({ icon: Icon, label, value, subtext }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBarChart({ data }: { data: Array<{ date: string; tokens: number }> }) {
  if (data.length === 0) return <p className="text-xs text-muted-foreground py-8 text-center">No usage data yet</p>;

  const max = Math.max(...data.map(d => d.tokens), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-primary/80 rounded-t-sm min-h-[2px] transition-all"
            style={{ height: `${(d.tokens / max) * 100}%` }}
          />
          {data.length <= 14 && (
            <span className="text-[9px] text-muted-foreground">
              {new Date(d.date).getDate()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function UsageDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [isPending, startTransition] = useTransition();

  function loadStats(p: Period) {
    startTransition(async () => {
      const data = await getUsageStatsAction(p);
      setStats(data);
    });
  }

  useEffect(() => {
    loadStats(period);
  }, [period]);

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Usage</h1>
          <p className="text-sm text-muted-foreground">Token consumption, costs, and activity</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'today' ? 'Today' : p === 'week' ? '7 Days' : '30 Days'}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => loadStats(period)} disabled={isPending}>
            <RefreshCwIcon className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {!stats ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={ActivityIcon}
                label="Total Calls"
                value={formatNumber(stats.totalCalls)}
              />
              <StatCard
                icon={ZapIcon}
                label="Total Tokens"
                value={formatNumber(stats.totalTokens)}
              />
              <StatCard
                icon={CoinsIcon}
                label="Estimated Cost"
                value={formatCost(stats.totalCost)}
              />
              <StatCard
                icon={CpuIcon}
                label="Avg Tokens/Call"
                value={stats.totalCalls > 0 ? formatNumber(Math.round(stats.totalTokens / stats.totalCalls)) : '0'}
              />
            </div>

            {/* Usage Chart */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium mb-3">Daily Token Usage</h3>
                <MiniBarChart data={stats.byDay} />
              </CardContent>
            </Card>

            {/* Breakdown Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Model */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium mb-3">By Model</h3>
                  {Object.keys(stats.byModel).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No usage data</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(stats.byModel)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([model, data]) => (
                          <div key={model} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{model}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{data.calls} calls</span>
                              <span>{formatNumber(data.tokens)} tokens</span>
                              <span className="font-medium text-foreground">{formatCost(data.cost)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* By Source */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium mb-3">By Source</h3>
                  {Object.keys(stats.bySource).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No usage data</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(stats.bySource)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([source, data]) => (
                          <div key={source} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{source}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{data.calls} calls</span>
                              <span>{formatNumber(data.tokens)} tokens</span>
                              <span className="font-medium text-foreground">{formatCost(data.cost)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
