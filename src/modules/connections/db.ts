import { SupabaseClient } from '@supabase/supabase-js';
import type { Connection } from '@/lib/types';

export async function getConnectionsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Connection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[connections] Failed to load connections:', error);
    return [];
  }

  return data as Connection[];
}

export async function createConnection(
  supabase: SupabaseClient,
  connection: {
    org_id: string;
    type: Connection['type'];
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }
): Promise<Connection | null> {
  const { data, error } = await supabase
    .from('connections')
    .insert(connection)
    .select()
    .single();

  if (error) {
    console.error('[connections] Failed to create connection:', error);
    return null;
  }

  return data as Connection;
}

export async function deleteConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    console.error('[connections] Failed to delete connection:', error);
    return false;
  }

  return true;
}

export async function updateConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: Connection['status'],
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('connections')
    .update({
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}
