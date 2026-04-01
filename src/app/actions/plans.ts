'use server';

import { getAuthContext } from './helpers';

export async function approvePlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { updatePlanStatus } = await import('@/modules/planning/db');
  await updatePlanStatus(supabase, planId, 'approved');
  return { success: true };
}

export async function cancelPlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { updatePlanStatus } = await import('@/modules/planning/db');
  await updatePlanStatus(supabase, planId, 'failed');
  return { success: true };
}

export async function getPlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { getPlan } = await import('@/modules/planning/db');
  return getPlan(supabase, planId);
}
