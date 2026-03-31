'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { addKnowledge, deleteKnowledge } from '@/modules/memory/knowledge';
import { createSkill, deleteSkill } from '@/modules/skills/db';
import {
  createScheduledTask,
  deleteScheduledTask,
  updateScheduledTaskStatus,
} from '@/modules/scheduler/db';
import {
  createConnection,
  deleteConnection,
} from '@/modules/connections/db';
import { getNextRunTime } from '@/modules/scheduler/matcher';
import { parseSkillFromNL } from '@/modules/skills/parser';
import { parseScheduleFromNL } from '@/modules/scheduler/parser';
import { clearMcpClientCache } from '@/modules/connections/mcp/client';

// ============================================================================
// Helpers
// ============================================================================

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) throw new Error('User not found');

  return { supabase, user, orgId: dbUser.org_id };
}

// ============================================================================
// Waitlist
// ============================================================================

export async function joinWaitlist(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email.' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.contacts.create({
      email,
      unsubscribed: false,
      segments: [{ id: process.env.RESEND_SEGMENT_ID! }],
    });
    return { success: true };
  } catch {
    return { error: 'Something went wrong. Please try again.' };
  }
}

// ============================================================================
// Knowledge
// ============================================================================

export async function addKnowledgeAction(content: string) {
  const { supabase, orgId } = await getAuthContext();
  const fact = await addKnowledge(supabase, orgId, content);
  if (!fact) return { error: 'Failed to add knowledge' };
  revalidatePath('/knowledge');
  return { success: true, fact };
}

export async function deleteKnowledgeAction(id: string) {
  const { supabase } = await getAuthContext();
  const success = await deleteKnowledge(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/knowledge');
  return { success: true };
}

// ============================================================================
// Skills
// ============================================================================

export async function parseSkillAction(description: string) {
  await getAuthContext();
  return await parseSkillFromNL(description, []);
}

export async function createSkillAction(skill: {
  name: string;
  description: string;
  trigger: string;
  steps: any[];
  tools: string[];
  outputFormat?: string;
}) {
  const { supabase, orgId } = await getAuthContext();
  const result = await createSkill(supabase, {
    org_id: orgId,
    name: skill.name,
    description: skill.description,
    trigger: skill.trigger,
    steps: skill.steps,
    tools: skill.tools,
    output_format: skill.outputFormat,
    created_by: 'user',
  });
  if (!result) return { error: 'Failed to create skill' };
  revalidatePath('/skills');
  return { success: true, skill: result };
}

export async function deleteSkillAction(id: string) {
  const { supabase } = await getAuthContext();
  const success = await deleteSkill(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/skills');
  return { success: true };
}

// ============================================================================
// Schedules
// ============================================================================

export async function parseScheduleAction(description: string) {
  await getAuthContext();
  return await parseScheduleFromNL(description);
}

export async function createScheduleAction(schedule: {
  name: string;
  cron: string;
  prompt: string;
}) {
  const { supabase, user, orgId } = await getAuthContext();

  let nextRunAt: string;
  try {
    nextRunAt = getNextRunTime(schedule.cron).toISOString();
  } catch {
    return { error: 'Invalid cron expression' };
  }

  const task = await createScheduledTask(supabase, {
    org_id: orgId,
    user_id: user.id,
    ...schedule,
    next_run_at: nextRunAt,
  });
  if (!task) return { error: 'Failed to create schedule' };
  revalidatePath('/schedules');
  return { success: true, task };
}

export async function toggleScheduleAction(id: string, status: 'active' | 'paused') {
  const { supabase } = await getAuthContext();
  await updateScheduledTaskStatus(supabase, id, status);
  revalidatePath('/schedules');
  return { success: true };
}

export async function deleteScheduleAction(id: string) {
  const { supabase } = await getAuthContext();
  const success = await deleteScheduledTask(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/schedules');
  return { success: true };
}

// ============================================================================
// Connections
// ============================================================================

export async function createConnectionAction(connection: {
  name: string;
  provider: string;
  type: 'mcp' | 'platform';
  config: Record<string, unknown>;
}) {
  const { supabase, orgId } = await getAuthContext();
  const result = await createConnection(supabase, {
    org_id: orgId,
    ...connection,
  });
  if (!result) return { error: 'Failed to create connection' };
  revalidatePath('/connections');
  return { success: true, connection: result };
}

export async function deleteConnectionAction(id: string) {
  const { supabase } = await getAuthContext();
  clearMcpClientCache(id);
  const success = await deleteConnection(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/connections');
  return { success: true };
}

export async function syncConnectionsAction() {
  const { supabase, orgId } = await getAuthContext();
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return { error: 'Composio not configured' };

  const resp = await fetch('https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true', {
    headers: { 'x-api-key': apiKey },
  });
  const data = await resp.json();
  const activeApps = [...new Set(
    ((data.items || []) as any[])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.appName)
  )];

  const { data: existing } = await supabase
    .from('connections').select('provider').eq('org_id', orgId).eq('type', 'platform');
  const existingProviders = new Set((existing || []).map((c: any) => c.provider));

  let synced = 0;
  for (const appName of activeApps) {
    if (existingProviders.has(appName)) continue;
    await supabase.from('connections').insert({
      org_id: orgId,
      type: 'platform',
      name: appName,
      provider: appName,
      config: { apps: [appName] },
      status: 'active',
    });
    synced++;
  }

  revalidatePath('/connections');
  return { success: true, synced };
}
