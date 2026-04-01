/**
 * Usage and cost tools — let Cooper report on its own resource consumption.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { getUsageSummary } from './usage';
import { checkBudget } from './budget';

export function createUsageTools(supabase: SupabaseClient, orgId: string) {
  return {
    get_usage: tool({
      description: `Get usage statistics — token consumption, costs, and budget status. Use when the user asks about costs, usage, how much they've spent, or budget status.`,
      inputSchema: z.object({
        period: z.enum(['today', 'week', 'month']).default('month').describe('Time period to query'),
      }),
      execute: async ({ period }) => {
        try {
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

          const [summary, budget] = await Promise.all([
            getUsageSummary(supabase, orgId, since),
            checkBudget(supabase, orgId),
          ]);

          return {
            period,
            totalTokens: summary.totalTokens,
            totalCost: `$${summary.totalCost.toFixed(4)}`,
            byModel: Object.fromEntries(
              Object.entries(summary.byModel).map(([model, data]) => [
                model,
                { calls: data.calls, tokens: data.tokens, cost: `$${data.cost.toFixed(4)}` },
              ])
            ),
            bySource: Object.fromEntries(
              Object.entries(summary.bySource).map(([source, data]) => [
                source,
                { calls: data.calls, tokens: data.tokens, cost: `$${data.cost.toFixed(4)}` },
              ])
            ),
            budget: budget.monthlyBudget ? {
              limit: `$${budget.monthlyBudget.toFixed(2)}`,
              spent: `$${budget.currentSpend.toFixed(4)}`,
              percentUsed: `${budget.percentUsed.toFixed(1)}%`,
              status: budget.isOverBudget ? 'over_budget' : budget.isNearBudget ? 'near_budget' : 'ok',
            } : null,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
  };
}
