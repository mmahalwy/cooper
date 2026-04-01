'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from './helpers';

// ============================================================================
// Webhooks
// ============================================================================

export async function getWebhooksAction() {
  const { supabase, orgId } = await getAuthContext();
  const { data } = await supabase
    .from('webhooks')
    .select('id, name, secret, event_types, is_active, last_triggered_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function createWebhookAction(name: string) {
  const { supabase, orgId } = await getAuthContext();
  const { data, error } = await supabase.from('webhooks').insert({
    org_id: orgId,
    name,
  }).select('id, secret').single();

  if (error) return { error: 'Failed to create webhook' };
  revalidatePath('/settings/webhooks');

  // Get org slug for URL
  const { data: org } = await supabase.from('organizations').select('slug').eq('id', orgId).single();

  return {
    id: data.id,
    secret: data.secret,
    url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://cooper-lac.vercel.app'}/api/webhook/${org?.slug}`,
  };
}

export async function deleteWebhookAction(webhookId: string) {
  const { supabase } = await getAuthContext();
  await supabase.from('webhooks').delete().eq('id', webhookId);
  revalidatePath('/settings/webhooks');
  return { success: true };
}

export async function toggleWebhookAction(webhookId: string, isActive: boolean) {
  const { supabase } = await getAuthContext();
  await supabase.from('webhooks').update({ is_active: isActive }).eq('id', webhookId);
  revalidatePath('/settings/webhooks');
  return { success: true };
}
