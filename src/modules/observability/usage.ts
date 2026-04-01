/**
 * Usage tracking — logs token consumption, costs, and latency for every LLM call.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// Cost per 1M tokens (input/output) — updated as of June 2025
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.5-flash-preview-05-20': { input: 0.15, output: 0.60 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-pro-preview-05-06': { input: 1.25, output: 10.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

export interface UsageEntry {
  orgId: string;
  userId?: string;
  threadId?: string;
  modelId: string;
  modelProvider: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
  source: 'chat' | 'scheduler' | 'memory_extraction' | 'thread_summary';
}

function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[modelId];
  if (!costs) return 0;
  return (promptTokens * costs.input + completionTokens * costs.output) / 1_000_000;
}

/**
 * Log a usage entry. Fire-and-forget — errors are caught and logged.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  entry: UsageEntry
): Promise<void> {
  try {
    const totalTokens = entry.promptTokens + entry.completionTokens;
    const cost = estimateCost(entry.modelId, entry.promptTokens, entry.completionTokens);

    await supabase.from('usage_logs').insert({
      org_id: entry.orgId,
      user_id: entry.userId || null,
      thread_id: entry.threadId || null,
      model_id: entry.modelId,
      model_provider: entry.modelProvider,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: cost,
      latency_ms: entry.latencyMs || null,
      source: entry.source,
    });

    console.log(
      `[usage] ${entry.source} | ${entry.modelId} | ${totalTokens} tokens | $${cost.toFixed(4)} | ${entry.latencyMs || '?'}ms`
    );
  } catch (error) {
    console.error('[usage] Failed to log usage:', error);
  }
}

/**
 * Get usage summary for an org within a date range.
 */
export async function getUsageSummary(
  supabase: SupabaseClient,
  orgId: string,
  since: Date
): Promise<{
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number; calls: number }>;
  bySource: Record<string, { tokens: number; cost: number; calls: number }>;
}> {
  const { data, error } = await supabase
    .from('usage_logs')
    .select('model_id, source, total_tokens, estimated_cost_usd')
    .eq('org_id', orgId)
    .gte('created_at', since.toISOString());

  if (error || !data) {
    return { totalTokens: 0, totalCost: 0, byModel: {}, bySource: {} };
  }

  const summary = {
    totalTokens: 0,
    totalCost: 0,
    byModel: {} as Record<string, { tokens: number; cost: number; calls: number }>,
    bySource: {} as Record<string, { tokens: number; cost: number; calls: number }>,
  };

  for (const row of data) {
    summary.totalTokens += row.total_tokens;
    summary.totalCost += parseFloat(row.estimated_cost_usd);

    if (!summary.byModel[row.model_id]) {
      summary.byModel[row.model_id] = { tokens: 0, cost: 0, calls: 0 };
    }
    summary.byModel[row.model_id].tokens += row.total_tokens;
    summary.byModel[row.model_id].cost += parseFloat(row.estimated_cost_usd);
    summary.byModel[row.model_id].calls++;

    if (!summary.bySource[row.source]) {
      summary.bySource[row.source] = { tokens: 0, cost: 0, calls: 0 };
    }
    summary.bySource[row.source].tokens += row.total_tokens;
    summary.bySource[row.source].cost += parseFloat(row.estimated_cost_usd);
    summary.bySource[row.source].calls++;
  }

  return summary;
}
