import { createClient } from '@supabase/supabase-js';
import { config } from '@/lib/config';

/**
 * Service role Supabase client — bypasses RLS.
 * Only use in server-side code that runs without a user session (cron jobs, webhooks).
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(config.supabase.url, serviceRoleKey);
}
