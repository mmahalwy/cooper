/**
 * Skill tools — let Cooper create and manage reusable skills from conversations.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createSkill, getSkillsForOrg, deleteSkill, updateSkill } from './db';

export function createSkillTools(supabase: SupabaseClient, orgId: string) {
  return {
    create_skill: tool({
      description: `Save a reusable skill (workflow) that you learned during this conversation.
Use this when you've successfully completed a multi-step task and want to remember how to do it again.
Good candidates: recurring reports, specific API workflows, data analysis patterns, multi-tool chains.
Bad candidates: simple lookups, one-off questions, trivial tasks.

The skill should capture the PROCESS, not the specific data. Think of it as a recipe.`,
      inputSchema: z.object({
        name: z.string().describe('Short kebab-case name, e.g., "weekly-posthog-report"'),
        description: z.string().describe('1-2 sentence description of what this skill does and when to use it'),
        trigger: z.string().describe('Natural language description of when to activate this skill, e.g., "when the user asks for a PostHog report"'),
        steps: z.array(z.object({
          action: z.string().describe('What to do in this step'),
          toolName: z.string().optional().describe('Which tool to use (if applicable)'),
          params: z.record(z.string(), z.unknown()).optional().describe('Key parameter patterns (not hardcoded values)'),
          condition: z.string().optional().describe('When to execute this step (if conditional)'),
        })).describe('Ordered steps to complete the workflow'),
        tools: z.array(z.string()).describe('List of tool names this skill uses'),
        outputFormat: z.string().optional().describe('How to format the final output (markdown template, sections, etc.)'),
      }),
      execute: async ({ name, description, trigger, steps, tools, outputFormat }) => {
        try {
          // Check if a skill with this name already exists
          const existing = await getSkillsForOrg(supabase, orgId);
          const duplicate = existing.find(s => s.name === name);
          if (duplicate) {
            return {
              created: false,
              alreadyExists: true,
              existingSkillId: duplicate.id,
              message: `Skill "${name}" already exists (ID: ${duplicate.id}). Use update_skill to improve it instead.`,
            };
          }

          const skill = await createSkill(supabase, {
            org_id: orgId,
            name,
            description,
            trigger,
            steps,
            tools,
            output_format: outputFormat,
            created_by: 'cooper',
          });

          if (!skill) return { created: false, error: 'Failed to save skill' };

          return {
            created: true,
            skillId: skill.id,
            name: skill.name,
            message: `Learned skill "${name}" — I'll use this workflow when ${trigger}.`,
          };
        } catch (error) {
          return { created: false, error: String(error) };
        }
      },
    }),

    update_skill: tool({
      description: `Update an existing skill with improved steps, description, or trigger conditions.
Use this when:
- You completed a task more efficiently than the skill described and want to improve it
- The skill's trigger conditions need to be refined
- You discovered a better approach to the workflow
- The user asks you to update or improve a skill

List skills first to get the skill ID, then update it.`,
      inputSchema: z.object({
        skillId: z.string().describe('The ID of the skill to update (get from list_skills)'),
        description: z.string().optional().describe('Updated description of what this skill does'),
        trigger: z.string().optional().describe('Updated trigger conditions'),
        steps: z.array(z.object({
          action: z.string(),
          toolName: z.string().optional(),
          params: z.record(z.string(), z.unknown()).optional(),
          condition: z.string().optional(),
        })).optional().describe('Updated ordered steps'),
        tools: z.array(z.string()).optional().describe('Updated list of tool names'),
        outputFormat: z.string().optional().describe('Updated output format'),
        reason: z.string().describe('Why you are updating this skill — what improved'),
      }),
      execute: async ({ skillId, description, trigger, steps, tools, outputFormat, reason }) => {
        try {
          const skill = await updateSkill(supabase, skillId, {
            description,
            trigger,
            steps,
            tools,
            output_format: outputFormat,
          });

          if (!skill) return { updated: false, error: 'Failed to update skill' };

          return {
            updated: true,
            skillId: skill.id,
            name: skill.name,
            version: skill.version,
            message: `Updated skill "${skill.name}" to v${skill.version}. Reason: ${reason}`,
          };
        } catch (error) {
          return { updated: false, error: String(error) };
        }
      },
    }),

    list_skills: tool({
      description: 'List all learned skills for this organization. Use when the user asks what skills or workflows you know.',
      inputSchema: z.object({}),
      execute: async () => {
        const skills = await getSkillsForOrg(supabase, orgId);
        if (skills.length === 0) {
          return { skills: [], message: 'No custom skills yet. I learn skills when I complete multi-step workflows.' };
        }
        return {
          skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            trigger: s.trigger,
            createdBy: s.created_by,
            enabled: s.enabled,
            stepCount: s.steps?.length || 0,
          })),
          message: `Found ${skills.length} skill(s).`,
        };
      },
    }),

    delete_skill: tool({
      description: 'Delete a learned skill. Confirm with the user first. Use list_skills to find the skill ID.',
      inputSchema: z.object({
        skillId: z.string().describe('The ID of the skill to delete'),
      }),
      execute: async ({ skillId }) => {
        const success = await deleteSkill(supabase, skillId);
        if (!success) return { deleted: false, error: 'Failed to delete skill' };
        return { deleted: true, message: 'Skill deleted.' };
      },
    }),
  };
}
