/**
 * Deep Work Mode — enables Cooper to work autonomously on complex,
 * multi-step tasks that would normally exceed a single response.
 *
 * When activated (via plan_task with many steps, or explicit "work on this
 * and get back to me"), Cooper:
 * 1. Creates a persistent plan in the database
 * 2. Executes each step, saving progress
 * 3. Handles errors by retrying or adapting
 * 4. Reports back with a summary when done
 *
 * Progress is persisted to workspace_notes so it survives across requests
 * and can be polled by the UI for live updates.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeepWorkStep {
  id: string;
  action: string;
  tool?: string;
  dependsOn?: string[];
}

export interface DeepWorkConfig {
  orgId: string;
  userId: string;
  threadId: string;
  goal: string;
  steps: DeepWorkStep[];
  maxRetries?: number;
  notifyOnComplete?: boolean;
}

export interface DeepWorkError {
  step: string;
  error: string;
  retried: boolean;
}

export interface DeepWorkResult {
  step: string;
  result: string;
}

export interface DeepWorkProgress {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  goal: string;
  approach: string;
  completedSteps: number;
  totalSteps: number;
  currentStep: string;
  errors: DeepWorkError[];
  results: DeepWorkResult[];
  startedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Persistence — uses workspace_notes for storage
// ---------------------------------------------------------------------------

function deepWorkKey(threadId: string): string {
  return `deep-work:${threadId}`;
}

export async function saveDeepWorkProgress(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
  progress: DeepWorkProgress,
): Promise<void> {
  await supabase.from('workspace_notes').upsert(
    {
      org_id: orgId,
      key: deepWorkKey(threadId),
      content: JSON.stringify(progress),
      metadata: { type: 'deep-work-progress' },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,key' },
  );
}

export async function getDeepWorkProgress(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
): Promise<DeepWorkProgress | null> {
  const { data } = await supabase
    .from('workspace_notes')
    .select('content')
    .eq('org_id', orgId)
    .eq('key', deepWorkKey(threadId))
    .single();

  if (!data) return null;
  try {
    return JSON.parse(data.content) as DeepWorkProgress;
  } catch {
    return null;
  }
}

export async function clearDeepWorkProgress(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
): Promise<void> {
  await supabase
    .from('workspace_notes')
    .delete()
    .eq('org_id', orgId)
    .eq('key', deepWorkKey(threadId));
}
