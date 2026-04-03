import type { SupabaseClient } from '@supabase/supabase-js';
import type { SlackInstallation } from './types';

export async function getInstallationByTeamId(
  supabase: SupabaseClient,
  teamId: string
): Promise<SlackInstallation | null> {
  const { data, error } = await supabase
    .from('slack_installations')
    .select('*')
    .eq('team_id', teamId)
    .single();

  if (error || !data) {
    console.error('[slack] Installation not found for team:', teamId, error);
    return null;
  }

  return data as SlackInstallation;
}

export async function getInstallationByOrgId(
  supabase: SupabaseClient,
  orgId: string
): Promise<SlackInstallation | null> {
  const { data, error } = await supabase
    .from('slack_installations')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as SlackInstallation;
}
