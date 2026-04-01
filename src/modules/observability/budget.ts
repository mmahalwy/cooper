/**
 * Budget management — check usage against org budgets.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface BudgetStatus {
  monthlyBudget: number | null;
  currentSpend: number;
  percentUsed: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
  alertThreshold: number;
  totalCalls: number;
  totalTokens: number;
}

/**
 * Check the current month's usage against the org's budget.
 */
export async function checkBudget(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BudgetStatus> {
  // Get org budget settings
  const { data: org } = await supabase
    .from('organizations')
    .select('monthly_budget_usd, budget_alert_threshold')
    .eq('id', orgId)
    .single();

  const budget = org?.monthly_budget_usd ? parseFloat(org.monthly_budget_usd) : null;
  const alertThreshold = org?.budget_alert_threshold ? parseFloat(org.budget_alert_threshold) : 0.80;

  // Get current month's usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: usage } = await supabase
    .from('usage_logs')
    .select('total_tokens, estimated_cost_usd')
    .eq('org_id', orgId)
    .gte('created_at', startOfMonth.toISOString());

  let currentSpend = 0;
  let totalTokens = 0;
  const totalCalls = usage?.length || 0;

  for (const row of usage || []) {
    currentSpend += parseFloat(row.estimated_cost_usd) || 0;
    totalTokens += row.total_tokens || 0;
  }

  const percentUsed = budget ? (currentSpend / budget) * 100 : 0;

  return {
    monthlyBudget: budget,
    currentSpend,
    percentUsed,
    isOverBudget: budget ? currentSpend >= budget : false,
    isNearBudget: budget ? percentUsed >= alertThreshold * 100 : false,
    alertThreshold,
    totalCalls,
    totalTokens,
  };
}
