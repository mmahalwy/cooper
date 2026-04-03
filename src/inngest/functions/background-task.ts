/**
 * Inngest function for background task execution.
 * Each step runs as a separate serverless invocation.
 */

import { inngest } from '../client';
import { createServiceClient } from '@/lib/supabase/service';
import { getBackgroundJob, updateJobStep, updateJobStatus } from '@/modules/background/db';
import { generateText, stepCountIs } from 'ai';
import { selectModel } from '@/modules/agent/model-router';
import { getComposioToolsForEntity } from '@/modules/connections/platform/composio';

const STEP_SYSTEM_PROMPT = `You are Cooper executing a background task step. Complete the instruction using your available tools. Be thorough but concise. Return just the result.

When using integration tools:
1. Use COMPOSIO_SEARCH_TOOLS to find the right action
2. Use COMPOSIO_GET_TOOL_SCHEMAS for parameter details if needed
3. Use COMPOSIO_MULTI_EXECUTE_TOOL to execute

Never show raw API URLs, curl commands, or internal tool names in your output.`;

async function executeStep(
  action: string,
  integration: string | null,
  connectedServices: string[],
  userId: string
): Promise<string> {
  const tools = integration ? await getComposioToolsForEntity(userId) : {};
  const modelSelection = selectModel(action, connectedServices);

  const result = await generateText({
    model: modelSelection.model,
    system: STEP_SYSTEM_PROMPT,
    prompt: action,
    tools,
    stopWhen: stepCountIs(8),
    providerOptions: modelSelection.provider === 'google' ? {
      google: { thinkingConfig: { thinkingBudget: 512 } },
    } : undefined,
  });

  return result.text || '(No output)';
}

export const backgroundTask = inngest.createFunction(
  {
    id: 'cooper-background-task',
    retries: 2,
    triggers: [{ event: 'cooper/background-task' }],
  },
  async ({ event, step }) => {
    const { jobId, threadId, orgId, userId, goal, steps, connectedServices } = event.data;
    const supabase = createServiceClient();

    // Mark job as running
    await step.run('mark-running', async () => {
      await updateJobStatus(supabase, jobId, 'running');
    });

    const stepResults: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const stepDef = steps[i];

      const result = await step.run(`execute-${stepDef.id}`, async () => {
        // Mark step as running
        await updateJobStep(supabase, jobId, stepDef.id, 'running');

        // Post progress
        await supabase.from('messages').insert({
          thread_id: threadId,
          role: 'assistant',
          content: `🔄 **Step ${i + 1}/${steps.length}:** ${stepDef.action}`,
          metadata: { background_job: jobId, step: stepDef.id },
        });

        try {
          // Execute the step
          const output = await executeStep(
            stepDef.action,
            stepDef.integration,
            connectedServices || [],
            userId
          );

          // Mark step as done
          await updateJobStep(supabase, jobId, stepDef.id, 'done', output);

          // Post result
          await supabase.from('messages').insert({
            thread_id: threadId,
            role: 'assistant',
            content: `✅ **Step ${i + 1}/${steps.length} complete**\n${output}`,
            metadata: { background_job: jobId, step: stepDef.id },
          });

          return output;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          await updateJobStep(supabase, jobId, stepDef.id, 'failed', errorMsg);

          await supabase.from('messages').insert({
            thread_id: threadId,
            role: 'assistant',
            content: `❌ **Step ${i + 1}/${steps.length} failed:** ${errorMsg}`,
            metadata: { background_job: jobId, step: stepDef.id },
          });

          return `(Failed: ${errorMsg})`;
        }
      });

      stepResults.push(result);
    }

    // Complete
    await step.run('complete', async () => {
      const finalResult = stepResults.filter(r => !r.startsWith('(Failed')).join('\n\n');

      await updateJobStatus(supabase, jobId, 'completed', finalResult);

      await supabase.from('messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: `🎉 **Done!** ${goal}\n\n${finalResult}`,
        metadata: { background_job: jobId, final: true },
      });
    });
  }
);
