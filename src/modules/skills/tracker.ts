/**
 * Skill usage tracking — records when skills are matched and used.
 *
 * Tracks:
 * - usage_count: how many times a skill has been activated
 * - last_used_at: when a skill was last matched to a request
 *
 * This data feeds into improvement decisions (don't update a skill
 * after one use) and helps surface unused skills for cleanup.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Increment usage count and update last_used_at for a matched skill.
 * Non-blocking — failures are logged but don't affect the chat flow.
 */
export async function trackSkillUsage(
  supabase: SupabaseClient,
  skillId: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_skill_usage', {
      skill_id: skillId,
    });

    if (error) {
      console.error(`[skill-tracker] Failed to track usage for ${skillId}:`, error);
    }
  } catch (error) {
    console.error('[skill-tracker] Error:', error);
  }
}

/**
 * Track usage for all matched skills in a single request.
 */
export async function trackMatchedSkills(
  supabase: SupabaseClient,
  matchedSkills: Array<{ id: string; name: string }>,
): Promise<void> {
  await Promise.allSettled(
    matchedSkills.map((skill) => trackSkillUsage(supabase, skill.id))
  );
}
