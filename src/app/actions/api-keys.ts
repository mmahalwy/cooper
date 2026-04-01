'use server';

import { getAuthContext } from './helpers';
import { revalidatePath } from 'next/cache';

export async function getApiKeysAction() {
  const { supabase, orgId } = await getAuthContext();
  const { data } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, last_used_at, expires_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function createApiKeyAction(name: string) {
  const { supabase, user, orgId } = await getAuthContext();

  // Generate key: ck_live_ + 32 random hex chars
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const key = `ck_live_${raw}`;
  const prefix = key.slice(0, 12) + '...';

  // Hash the key for storage
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { error } = await supabase.from('api_keys').insert({
    org_id: orgId,
    user_id: user.id,
    name,
    key_hash: keyHash,
    key_prefix: prefix,
  });

  if (error) return { error: 'Failed to create key' };

  revalidatePath('/settings/api-keys');
  return { key }; // Only returned once — never stored in plaintext
}

export async function revokeApiKeyAction(keyId: string) {
  const { supabase } = await getAuthContext();
  await supabase.from('api_keys').delete().eq('id', keyId);
  revalidatePath('/settings/api-keys');
  return { success: true };
}
