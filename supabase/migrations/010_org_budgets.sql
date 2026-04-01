-- Add budget settings to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS monthly_budget_usd numeric(10, 2) DEFAULT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS budget_alert_threshold numeric(3, 2) DEFAULT 0.80;

-- Create a materialized view for fast org-level usage queries
CREATE OR REPLACE VIEW public.org_usage_current_month AS
SELECT
  org_id,
  COUNT(*) as total_calls,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost_usd,
  SUM(CASE WHEN source = 'chat' THEN estimated_cost_usd ELSE 0 END) as chat_cost_usd,
  SUM(CASE WHEN source = 'scheduler' THEN estimated_cost_usd ELSE 0 END) as scheduler_cost_usd,
  MAX(created_at) as last_usage_at
FROM public.usage_logs
WHERE created_at >= date_trunc('month', now())
GROUP BY org_id;
