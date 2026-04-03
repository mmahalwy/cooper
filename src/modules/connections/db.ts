import { SupabaseClient } from '@supabase/supabase-js';
import type { Connection } from '@/lib/types';
import { getDefaultScope } from './scopes';

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

/**
 * Get connections visible to a specific user:
 * their own connections (any scope) + other users' shared connections
 */
export async function getConnectionsForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<Connection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .or(`user_id.eq.${userId},scope.eq.shared`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[connections] Failed to load connections for user:', error);
    return [];
  }

  return data as Connection[];
}

export async function createConnection(
  supabase: SupabaseClient,
  connection: {
    org_id: string;
    user_id?: string;
    scope?: 'personal' | 'shared';
    composio_entity_id?: string;
    type: Connection['type'];
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }
): Promise<Connection | null> {
  const { data, error } = await supabase
    .from('connections')
    .insert({
      ...connection,
      scope: connection.scope || getDefaultScope(connection.provider),
      composio_entity_id: connection.composio_entity_id || connection.user_id || null,
    })
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

export async function updateConnectionScope(
  supabase: SupabaseClient,
  connectionId: string,
  scope: 'personal' | 'shared'
): Promise<void> {
  await supabase
    .from('connections')
    .update({ scope, updated_at: new Date().toISOString() })
    .eq('id', connectionId);
}
