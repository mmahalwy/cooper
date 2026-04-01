import { SupabaseClient } from '@supabase/supabase-js';
import type { Plan, PlanStep } from '@/lib/types';

export async function createPlan(
  supabase: SupabaseClient,
  plan: { thread_id: string; org_id: string; title: string; steps: PlanStep[] }
): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('plans')
    .insert(plan)
    .select('*')
    .single();

  if (error) {
    console.error('[planning] Failed to create plan:', error);
    return null;
  }
  return data as Plan;
}

export async function getPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) return null;
  return data as Plan;
}

export async function updatePlanStatus(
  supabase: SupabaseClient,
  planId: string,
  status: Plan['status']
): Promise<void> {
  await supabase
    .from('plans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', planId);
}

export async function updatePlanStep(
  supabase: SupabaseClient,
  planId: string,
  stepId: string,
  updates: Partial<Pick<PlanStep, 'status' | 'output'>>
): Promise<void> {
  const plan = await getPlan(supabase, planId);
  if (!plan) return;

  const updatedSteps = plan.steps.map((step) =>
    step.id === stepId ? { ...step, ...updates } : step
  );

  await supabase
    .from('plans')
    .update({ steps: updatedSteps, updated_at: new Date().toISOString() })
    .eq('id', planId);
}

export async function getPlansForThread(
  supabase: SupabaseClient,
  threadId: string
): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data as Plan[];
}
