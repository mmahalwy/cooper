/**
 * Deep Work tools — agent-side tools for starting and reporting
 * on sustained autonomous work sessions.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  saveDeepWorkProgress,
  getDeepWorkProgress,
  type DeepWorkProgress,
} from './deep-work';

export function createDeepWorkTools(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId: string,
) {
  return {
    start_deep_work: tool({
      description: `Initiate a deep work session for a complex, multi-step task. Use this when:
- The task has 5+ distinct steps that need to happen in sequence
- The user says "work on this and get back to me" or similar
- The task involves research, analysis, and synthesis
- You need to try multiple approaches and pick the best one

This creates a persistent work session that tracks progress across steps.
You'll execute each step, track progress, handle errors, and compile a final result.`,
      inputSchema: z.object({
        goal: z.string().describe('Clear description of the end goal'),
        approach: z.string().describe('Your planned approach in 2-3 sentences'),
        steps: z
          .array(
            z.object({
              id: z.string().describe('Unique step ID like "step-1"'),
              action: z.string().describe('What to do in this step'),
              tool: z.string().optional().describe('Which tool/service to use, if any'),
            }),
          )
          .min(3)
          .max(20),
        estimatedMinutes: z.number().min(1).max(60).describe('Estimated minutes to complete'),
      }),
      execute: async ({ goal, approach, steps, estimatedMinutes }) => {
        const progress: DeepWorkProgress = {
          taskId: `dw-${Date.now()}`,
          status: 'running',
          goal,
          approach,
          completedSteps: 0,
          totalSteps: steps.length,
          currentStep: steps[0].action,
          errors: [],
          results: [],
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await saveDeepWorkProgress(supabase, orgId, threadId, progress);

        return {
          started: true,
          sessionId: progress.taskId,
          goal,
          approach,
          stepCount: steps.length,
          estimatedMinutes,
          message: `Deep work session started. I'll work through ${steps.length} steps and report back. Estimated time: ~${estimatedMinutes} minutes.`,
        };
      },
    }),

    report_deep_work_progress: tool({
      description:
        'Report progress on the current deep work session. Call this after completing each major milestone.',
      inputSchema: z.object({
        completedStep: z.string().describe('What was just completed'),
        result: z.string().describe('Brief result or output from this step'),
        nextStep: z.string().optional().describe('What you are doing next'),
        error: z.string().optional().describe('Error message if the step failed'),
      }),
      execute: async ({ completedStep, result, nextStep, error }) => {
        const progress = await getDeepWorkProgress(supabase, orgId, threadId);

        if (!progress) {
          return {
            reported: false,
            error: 'No active deep work session found. Start one with start_deep_work first.',
          };
        }

        progress.completedSteps += 1;
        progress.currentStep = nextStep || 'Finishing up';
        progress.updatedAt = new Date().toISOString();

        if (error) {
          progress.errors.push({
            step: completedStep,
            error,
            retried: false,
          });
        }

        progress.results.push({ step: completedStep, result });

        // Auto-complete when all steps are done
        if (progress.completedSteps >= progress.totalSteps) {
          progress.status = progress.errors.length > 0 ? 'failed' : 'completed';
          progress.currentStep = 'Done';
        }

        await saveDeepWorkProgress(supabase, orgId, threadId, progress);

        return {
          reported: true,
          completedStep,
          nextStep: nextStep || 'Compiling final result',
          totalCompleted: progress.completedSteps,
          totalSteps: progress.totalSteps,
          sessionStatus: progress.status,
        };
      },
    }),

    get_deep_work_status: tool({
      description:
        'Check the status of the current deep work session. Use when the user asks for progress.',
      inputSchema: z.object({}),
      execute: async () => {
        const progress = await getDeepWorkProgress(supabase, orgId, threadId);

        if (!progress) {
          return { active: false, message: 'No active deep work session in this thread.' };
        }

        return {
          active: progress.status === 'running',
          status: progress.status,
          goal: progress.goal,
          completedSteps: progress.completedSteps,
          totalSteps: progress.totalSteps,
          currentStep: progress.currentStep,
          results: progress.results,
          errors: progress.errors,
          startedAt: progress.startedAt,
          updatedAt: progress.updatedAt,
        };
      },
    }),
  };
}
