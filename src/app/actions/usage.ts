'use server';

import { getAuthContext } from './helpers';

export async function getUsageStatsAction(period: 'today' | 'week' | 'month' = 'month') {
  const { supabase, orgId } = await getAuthContext();

  const now = new Date();
  let since: Date;
  switch (period) {
    case 'today':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
    default:
      since = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const { data: logs } = await supabase
    .from('usage_logs')
    .select('*')
    .eq('org_id', orgId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (!logs || logs.length === 0) {
    return {
      totalTokens: 0,
      totalCost: 0,
      totalCalls: 0,
      byModel: {} as Record<string, { calls: number; tokens: number; cost: number }>,
      bySource: {} as Record<string, { calls: number; tokens: number; cost: number }>,
      byDay: [] as Array<{ date: string; tokens: number; cost: number; calls: number }>,
    };
  }

  let totalTokens = 0;
  let totalCost = 0;
  const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};
  const bySource: Record<string, { calls: number; tokens: number; cost: number }> = {};
  const byDayMap: Record<string, { tokens: number; cost: number; calls: number }> = {};

  for (const log of logs) {
    const tokens = (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    const cost = parseFloat(log.estimated_cost_usd) || 0;
    totalTokens += tokens;
    totalCost += cost;

    const model = log.model_id || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, tokens: 0, cost: 0 };
    byModel[model].calls++;
    byModel[model].tokens += tokens;
    byModel[model].cost += cost;

    const source = log.source || 'unknown';
    if (!bySource[source]) bySource[source] = { calls: 0, tokens: 0, cost: 0 };
    bySource[source].calls++;
    bySource[source].tokens += tokens;
    bySource[source].cost += cost;

    const day = new Date(log.created_at).toISOString().split('T')[0];
    if (!byDayMap[day]) byDayMap[day] = { tokens: 0, cost: 0, calls: 0 };
    byDayMap[day].tokens += tokens;
    byDayMap[day].cost += cost;
    byDayMap[day].calls++;
  }

  const byDay = Object.entries(byDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  return { totalTokens, totalCost, totalCalls: logs.length, byModel, bySource, byDay };
}
