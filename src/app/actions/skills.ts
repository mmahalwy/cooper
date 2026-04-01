'use server';

import { revalidatePath } from 'next/cache';
import { createSkill, deleteSkill } from '@/modules/skills/db';
import { parseSkillFromNL } from '@/modules/skills/parser';
import { getAuthContext } from './helpers';

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
