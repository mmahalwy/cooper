-- Fix: usage_logs had SELECT policy but no INSERT policy.
-- trackUsage inserts were silently failing due to RLS.
CREATE POLICY "Users can insert own org usage"
  ON public.usage_logs FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));
