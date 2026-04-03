import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from '@/modules/memory/embeddings';
import type { Skill } from '@/lib/types';

export async function getSkillsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Skill[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, usage_count, last_used_at, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[skills] Failed to load:', error);
    return [];
  }

  return data as Skill[];
}

export async function createSkill(
  supabase: SupabaseClient,
  skill: {
    org_id: string;
    name: string;
    description: string;
    trigger: string;
    steps: Skill['steps'];
    tools: string[];
    output_format?: string;
    created_by: 'user' | 'cooper';
  }
): Promise<Skill | null> {
  const embeddingText = `${skill.name}: ${skill.description}. Trigger: ${skill.trigger}`;
  const embedding = await embeddingProvider.embed(embeddingText);

  const { data, error } = await supabase
    .from('skills')
    .insert({
      ...skill,
      embedding,
    })
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, usage_count, last_used_at, created_at, updated_at')
    .single();

  if (error) {
    console.error('[skills] Failed to create:', error);
    return null;
  }

  return data as Skill;
}

export async function updateSkill(
  supabase: SupabaseClient,
  skillId: string,
  updates: {
    description?: string;
    trigger?: string;
    steps?: Skill['steps'];
    tools?: string[];
    output_format?: string;
  }
): Promise<Skill | null> {
  // Fetch current skill to get version + fill missing embedding fields
  const { data: current } = await supabase
    .from('skills')
    .select('name, description, trigger, version')
    .eq('id', skillId)
    .single();

  if (!current) {
    console.error('[skills] Skill not found for update:', skillId);
    return null;
  }

  // Re-embed if description or trigger changed
  let embedding: number[] | undefined;
  if (updates.description || updates.trigger) {
    const embeddingText = `${current.name}: ${updates.description || current.description}. Trigger: ${updates.trigger || current.trigger}`;
    embedding = await embeddingProvider.embed(embeddingText);
  }

  const { data, error } = await supabase
    .from('skills')
    .update({
      ...updates,
      ...(embedding ? { embedding } : {}),
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', skillId)
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, usage_count, last_used_at, created_at, updated_at')
    .single();

  if (error) {
    console.error('[skills] Failed to update:', error);
    return null;
  }

  return data as Skill;
}

export async function deleteSkill(
  supabase: SupabaseClient,
  skillId: string
): Promise<boolean> {
  const { error } = await supabase.from('skills').delete().eq('id', skillId);
  if (error) {
    console.error('[skills] Failed to delete:', error);
    return false;
  }
  return true;
}
