/**
 * Automatic skill learning — evaluates complex interactions and saves
 * reusable workflows as skills without explicit tool calls.
 *
 * Runs in the background after responses that use 3+ tools, which
 * suggests a multi-step workflow worth potentially remembering.
 *
 * Only ~10% of eligible interactions should produce a skill —
 * we're deliberately selective to avoid noise.
 */

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createSkill, getSkillsForOrg } from './db';

const skillEvalSchema = z.object({
  shouldLearn: z
    .boolean()
    .describe(
      'Whether this interaction contains a reusable workflow worth saving'
    ),
  reason: z.string().describe('Why or why not'),
  skill: z
    .object({
      name: z
        .string()
        .describe('Short kebab-case name, e.g., "weekly-posthog-report"'),
      description: z
        .string()
        .describe('1-2 sentence description of what this skill does'),
      trigger: z
        .string()
        .describe(
          'Natural language description of when to activate, e.g., "when the user asks for a PostHog report"'
        ),
      steps: z.array(
        z.object({
          action: z.string().describe('What to do in this step'),
          toolName: z
            .string()
            .optional()
            .describe('Which tool to use, if applicable'),
        })
      ),
      tools: z.array(z.string()).describe('Tool names this skill uses'),
      outputFormat: z
        .string()
        .optional()
        .describe('How to format the final output'),
    })
    .optional()
    .describe('The skill definition, if shouldLearn is true'),
});

export type SkillEvalResult = z.infer<typeof skillEvalSchema>;

/**
 * Evaluate whether a conversation exchange contains a reusable workflow
 * and, if so, save it as an auto-learned skill.
 *
 * @returns Whether a skill was learned and its name.
 */
export async function evaluateAndLearnSkill(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[]
): Promise<{ learned: boolean; skillName?: string }> {
  // Only evaluate if the response used multiple tools — simple
  // interactions are never worth saving as skills.
  if (toolsUsed.length < 3) {
    return { learned: false };
  }

  try {
    // Fetch existing skills so we can detect (and avoid) duplicates
    const existingSkills = await getSkillsForOrg(supabase, orgId);
    const existingDescriptions = existingSkills.map(
      (s) => `${s.name}: ${s.description}`
    );

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: skillEvalSchema,
      prompt: `You are evaluating whether an AI assistant interaction contains a REUSABLE workflow worth saving as a skill.

## Existing skills (avoid duplicates):
${existingDescriptions.length > 0 ? existingDescriptions.map((d) => `- ${d}`).join('\n') : '(none)'}

## Interaction:
User: ${userMessage.slice(0, 2000)}
Assistant: ${assistantResponse.slice(0, 4000)}
Tools used: ${toolsUsed.join(', ')}

## Criteria for learning a skill:
- The workflow has 3+ meaningful, distinct steps
- It's likely to be repeated (weekly reports, common lookups, standard processes)
- It uses a specific combination of tools in a deliberate order
- The output has a consistent, reproducible format

## DO NOT learn:
- One-off questions or lookups
- Simple tool calls (even if multiple calls were made)
- Conversations that are too specific to one data point to generalize
- Skills that duplicate or substantially overlap existing ones (check the list above)
- Error-recovery flows (retrying the same thing isn't a skill)

Most interactions should NOT produce a skill. Be selective — only ~10% of complex interactions are worth remembering.`,
    });

    if (!result.object.shouldLearn || !result.object.skill) {
      return { learned: false };
    }

    const skill = result.object.skill;

    // Double-check for name collisions
    const nameExists = existingSkills.some(
      (s) => s.name.toLowerCase() === skill.name.toLowerCase()
    );
    if (nameExists) {
      console.log(
        `[skill-learner] Skipped duplicate name: "${skill.name}"`
      );
      return { learned: false };
    }

    const created = await createSkill(supabase, {
      org_id: orgId,
      name: skill.name,
      description: skill.description,
      trigger: skill.trigger,
      steps: skill.steps,
      tools: skill.tools,
      output_format: skill.outputFormat,
      created_by: 'cooper',
    });

    if (created) {
      console.log(`[skill-learner] Auto-learned skill: "${skill.name}"`);
      return { learned: true, skillName: skill.name };
    }

    return { learned: false };
  } catch (error) {
    // Non-critical — don't break the chat flow
    console.error('[skill-learner] Failed:', error);
    return { learned: false };
  }
}
