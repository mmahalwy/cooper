'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from './helpers';

export async function getTeamAction() {
  const { supabase, orgId } = await getAuthContext();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.from('users').select('id, email, name, role, created_at').eq('org_id', orgId).order('created_at'),
    supabase.from('invitations').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false }),
  ]);

  return { members: members || [], invitations: invitations || [] };
}

export async function inviteCoworkerAction(email: string, role: 'admin' | 'member' = 'member') {
  const { supabase, user, orgId } = await getAuthContext();

  // Check if user is admin
  const { data: currentUser } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (currentUser?.role !== 'admin') return { error: 'Only admins can invite members' };

  // Check if email is already a member
  const { data: existing } = await supabase
    .from('users').select('id').eq('org_id', orgId).eq('email', email).single();
  if (existing) return { error: 'This person is already a team member' };

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from('invitations').select('id').eq('org_id', orgId).eq('email', email).eq('status', 'pending').single();
  if (existingInvite) return { error: 'An invitation is already pending for this email' };

  const { error } = await supabase.from('invitations').insert({
    org_id: orgId,
    email,
    role,
    invited_by: user.id,
  });

  if (error) return { error: 'Failed to create invitation' };

  revalidatePath('/settings/team');
  return { success: true };
}

export async function revokeInvitationAction(inviteId: string) {
  const { supabase } = await getAuthContext();
  await supabase.from('invitations').delete().eq('id', inviteId);
  revalidatePath('/settings/team');
  return { success: true };
}

export async function updateMemberRoleAction(userId: string, role: 'admin' | 'member') {
  const { supabase, user } = await getAuthContext();
  if (userId === user.id) return { error: 'Cannot change your own role' };

  const { error } = await supabase.from('users').update({ role }).eq('id', userId);
  if (error) return { error: 'Failed to update role' };

  revalidatePath('/settings/team');
  return { success: true };
}
