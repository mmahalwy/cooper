/**
 * Skill improvement — compares a skill's expected steps with what
 * actually happened during execution and updates the skill when the
 * real workflow was meaningfully different (and better).
 *
 * This creates a continuous improvement loop: skills get more accurate
 * every time they're used, converging on the actual best workflow.
 *
 * Flow:
 * 1. Skill matched → injected into context
 * 2. Agent executes (may deviate from documented steps)
 * 3. Post-response: compare actual vs documented
 * 4. If better: update skill with new steps/description/trigger
 */

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from '@/modules/memory/embeddings';
import type { Skill } from '@/lib/types';

const improvementSchema = z.object({
  shouldUpdate: z
    .boolean()
    .describe(
      'Whether the skill definition should be updated based on this execution'
    ),
  reason: z.string().describe('Why or why not'),
  updatedSteps: z
    .array(
      z.object({
        action: z.string().describe('What to do in this step'),
        toolName: z
          .string()
          .optional()
          .describe('Which tool to use, if applicable'),
      })
    )
    .optional()
    .describe('The improved step sequence, if shouldUpdate is true'),
  updatedTools: z
    .array(z.string())
    .optional()
    .describe('Updated tool list, if tools changed'),
  updatedDescription: z
    .string()
    .optional()
    .describe('Updated description, if the skill scope changed'),
  updatedTrigger: z
    .string()
    .optional()
    .describe('Updated trigger, if activation criteria changed'),
  updatedOutputFormat: z
    .string()
    .optional()
    .describe('Updated output format, if it changed'),
});

export type SkillImprovementResult = z.infer<typeof improvementSchema>;

/**
 * Evaluate whether a skill should be updated after it was used.
 *
 * Compares the skill's defined steps/tools against what actually happened
 * during execution. If the real workflow deviated in a meaningful way
 * (extra steps, different tool order, better output format), the skill
 * is updated so future runs benefit.
 *
 * Only updates when there's a clear improvement — cosmetic differences
 * or one-off deviations are ignored.
 */
export async function evaluateSkillPerformance(
  supabase: SupabaseClient,
  orgId: string,
  skillName: string,
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[]
): Promise<void> {
  try {
    // Load the skill that was used
    const { data: skills, error } = await supabase
      .from('skills')
      .select(
        'id, name, description, trigger, steps, tools, output_format, version'
      )
      .eq('org_id', orgId)
      .eq('name', skillName)
      .eq('enabled', true)
      .limit(1);

    if (error || !skills || skills.length === 0) {
      return;
    }

    const skill = skills[0] as Skill;
    const definedSteps = (skill.steps || [])
      .map((s, i) => `${i + 1}. ${s.action}${s.toolName ? ` (${s.toolName})` : ''}`)
      .join('\n');
    const definedTools = skill.tools.join(', ');

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: improvementSchema,
      prompt: `You are evaluating whether a saved skill definition should be updated based on how it was actually executed.

## Saved skill: "${skill.name}"
Description: ${skill.description}
Trigger: ${skill.trigger}
Defined steps:
${definedSteps || '(no steps defined)'}
Defined tools: ${definedTools || '(none)'}
Output format: ${skill.output_format || '(none)'}

## What actually happened:
User: ${userMessage.slice(0, 1500)}
Assistant: ${assistantResponse.slice(0, 3000)}
Tools actually used: ${toolsUsed.join(', ')}

## Update the skill ONLY if:
- The actual workflow added meaningful new steps not in the definition
- Tools were used in a clearly better order
- The output format was significantly improved
- A step was consistently skipped (remove it)
- The description no longer reflects what the skill actually does
- The trigger condition should be broader or more specific

## DO NOT update if:
- The difference is cosmetic (wording changes, minor reordering)
- The deviation was caused by an error or edge case
- The skill was only used once — wait for a pattern
- The changes would make the skill less general

Most executions should NOT trigger an update. Be conservative.`,
    });

    if (!result.object.shouldUpdate) {
      return;
    }

    // Build the update payload — only include fields that changed
    const updates: Record<string, unknown> = {
      version: (skill.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    if (result.object.updatedSteps) {
      updates.steps = result.object.updatedSteps;
    }
    if (result.object.updatedTools) {
      updates.tools = result.object.updatedTools;
    }
    if (result.object.updatedDescription) {
      updates.description = result.object.updatedDescription;
    }
    if (result.object.updatedTrigger) {
      updates.trigger = result.object.updatedTrigger;
    }
    if (result.object.updatedOutputFormat) {
      updates.output_format = result.object.updatedOutputFormat;
    }

    // Re-embed if description or trigger changed (affects future matching)
    if (result.object.updatedDescription || result.object.updatedTrigger) {
      try {
        const newDesc = result.object.updatedDescription || skill.description;
        const newTrigger = result.object.updatedTrigger || skill.trigger;
        const embeddingText = `${skill.name}: ${newDesc}. Trigger: ${newTrigger}`;
        updates.embedding = await embeddingProvider.embed(embeddingText);
      } catch (embedError) {
        console.error('[skill-improver] Failed to re-embed, skipping embedding update:', embedError);
        // Continue with other updates — embedding can be refreshed later
      }
    }

    const { error: updateError } = await supabase
      .from('skills')
      .update(updates)
      .eq('id', skill.id);

    if (updateError) {
      console.error(
        `[skill-improver] Failed to update "${skill.name}":`,
        updateError
      );
      return;
    }

    console.log(
      `[skill-improver] Updated "${skill.name}" to v${updates.version}: ${result.object.reason}`
    );
  } catch (error) {
    // Non-critical — don't break the chat flow
    console.error('[skill-improver] Failed:', error);
  }
}
