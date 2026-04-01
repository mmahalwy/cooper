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

export async function getScheduleRunsAction(taskId: string) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('threads')
    .select('id, title, created_at')
    .eq('scheduled_task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
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

export async function saveToolPermissionAction(
  connectionId: string,
  toolName: string,
  permission: 'auto' | 'confirm' | 'disabled'
) {
  const { supabase } = await getAuthContext();

  // Fetch current config
  const { data: conn } = await supabase
    .from('connections')
    .select('config')
    .eq('id', connectionId)
    .single();

  if (!conn) return { error: 'Connection not found' };

  const config = (conn.config || {}) as Record<string, any>;
  const toolPermissions = config.toolPermissions || {};
  toolPermissions[toolName] = permission;

  await supabase
    .from('connections')
    .update({ config: { ...config, toolPermissions }, updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  return { success: true };
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

// ============================================================================
// Persona
// ============================================================================

export async function getPersonaAction() {
  const { supabase, orgId } = await getAuthContext();
  const { data } = await supabase
    .from('organizations')
    .select('persona_name, persona_instructions, persona_tone')
    .eq('id', orgId)
    .single();
  return data || { persona_name: 'Cooper', persona_instructions: '', persona_tone: 'professional' };
}

export async function updatePersonaAction(updates: { persona_name?: string; persona_instructions?: string; persona_tone?: string }) {
  const { supabase, orgId } = await getAuthContext();
  const { error } = await supabase.from('organizations').update(updates).eq('id', orgId);
  if (error) return { error: 'Failed to update persona' };
  revalidatePath('/settings/persona');
  return { success: true };
}

// ============================================================================
// Connection Tools
// ============================================================================

export interface ConnectionTool {
  name: string;
  displayName: string;
  description: string;
  tags: string[];
}

export async function getConnectionToolsAction(appName: string): Promise<ConnectionTool[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return [];

  const allTools: ConnectionTool[] = [];
  let page = 1;
  const limit = 100;

  // Paginate through all actions for this app
  while (true) {
    const resp = await fetch(
      `https://backend.composio.dev/api/v2/actions?apps=${appName}&limit=${limit}&page=${page}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const items = data.items || [];

    for (const item of items) {
      allTools.push({
        name: item.name || '',
        displayName: item.displayName || item.name?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) || '',
        description: item.description || '',
        tags: item.tags || [],
      });
    }

    if (items.length < limit || page >= (data.totalPages || 1)) break;
    page++;
  }

  return allTools;
}

// ============================================================================
// Usage
// ============================================================================

export async function getUsageStatsAction(period: 'today' | 'week' | 'month' = 'month') {
  const { supabase, orgId } = await getAuthContext();

  const now = new Date();
  let since: Date;
  switch (period) {
    case 'today':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
    default:
      since = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const { data: logs } = await supabase
    .from('usage_logs')
    .select('*')
    .eq('org_id', orgId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (!logs || logs.length === 0) {
    return {
      totalTokens: 0,
      totalCost: 0,
      totalCalls: 0,
      byModel: {} as Record<string, { calls: number; tokens: number; cost: number }>,
      bySource: {} as Record<string, { calls: number; tokens: number; cost: number }>,
      byDay: [] as Array<{ date: string; tokens: number; cost: number; calls: number }>,
    };
  }

  let totalTokens = 0;
  let totalCost = 0;
  const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};
  const bySource: Record<string, { calls: number; tokens: number; cost: number }> = {};
  const byDayMap: Record<string, { tokens: number; cost: number; calls: number }> = {};

  for (const log of logs) {
    const tokens = (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    const cost = parseFloat(log.estimated_cost_usd) || 0;
    totalTokens += tokens;
    totalCost += cost;

    const model = log.model_id || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, tokens: 0, cost: 0 };
    byModel[model].calls++;
    byModel[model].tokens += tokens;
    byModel[model].cost += cost;

    const source = log.source || 'unknown';
    if (!bySource[source]) bySource[source] = { calls: 0, tokens: 0, cost: 0 };
    bySource[source].calls++;
    bySource[source].tokens += tokens;
    bySource[source].cost += cost;

    const day = new Date(log.created_at).toISOString().split('T')[0];
    if (!byDayMap[day]) byDayMap[day] = { tokens: 0, cost: 0, calls: 0 };
    byDayMap[day].tokens += tokens;
    byDayMap[day].cost += cost;
    byDayMap[day].calls++;
  }

  const byDay = Object.entries(byDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  return { totalTokens, totalCost, totalCalls: logs.length, byModel, bySource, byDay };
}
