import { tool } from 'ai';
import { z } from 'zod';

export function createPlanningTools() {
  return {
    plan_task: tool({
      description: `Create an execution plan before starting complex work. Use this when:
- The user's request involves 3+ steps
- You need to gather information from multiple sources
- The task requires careful sequencing
- You want to show the user your approach before diving in

Output a structured plan that you'll then follow step by step.`,
      parameters: z.object({
        goal: z.string().describe('What the user wants to achieve'),
        steps: z
          .array(
            z.object({
              id: z.string(),
              action: z.string().describe('What to do in this step'),
              tool: z.string().optional().describe('Which tool to use'),
              dependsOn: z.array(z.string()).optional().describe('Step IDs this depends on'),
            }),
          )
          .min(2)
          .max(10),
        estimatedTime: z.string().optional().describe('How long this might take'),
      }),
      execute: async ({ goal, steps, estimatedTime }) => {
        // Plan is informational — the agent follows it on subsequent steps
        return {
          planned: true,
          goal,
          stepCount: steps.length,
          estimatedTime: estimatedTime || 'a few minutes',
          message: `Plan created with ${steps.length} steps. Executing now...`,
          steps: steps.map((s) => ({ ...s, status: 'pending' as const })),
        };
      },
    }),

    update_plan_step: tool({
      description:
        'Mark a step in your plan as complete or failed. Use after finishing each planned step.',
      parameters: z.object({
        stepId: z.string(),
        status: z.enum(['complete', 'failed', 'skipped']),
        note: z.string().optional(),
      }),
      execute: async ({ stepId, status, note }) => {
        return { updated: true, stepId, status, note };
      },
    }),
  };
}
