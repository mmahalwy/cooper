/**
 * Background task worker — processes queued tasks using the AI agent.
 *
 * Called from the `/api/cron/tasks` endpoint on a regular cadence.
 * Each task gets its own `generateText` call with full tool access,
 * mirroring the scheduler executor pattern.
 */

import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { trackUsage } from '@/modules/observability/usage';
import { claimNextTask, completeTask, failTask, type BackgroundTask } from './queue';

const TASK_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes (stay under Vercel's 5-min max)

const SYSTEM_PROMPT = `You are Cooper, executing a background task.
Be thorough and provide a complete result. Use any available tools to accomplish the task.

## Slack Formatting
When posting to Slack, use Slack mrkdwn — NOT Markdown:
- Bold: *bold* (single asterisks, NOT **)
- Italic: _italic_
- NO headers (# or ##) — use *bold text* on its own line
- Bulleted lists: "• " or "- "
- Links: <https://url|text>
Keep Slack messages concise and scannable.`;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Background task ${label} timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Process a single claimed task end-to-end.
 */
async function executeTask(supabase: SupabaseClient, task: BackgroundTask): Promise<void> {
  const startTime = Date.now();

  const tools = await getToolsForOrg(supabase, task.org_id, task.user_id, { skipApproval: true });
  const memoryContext = await retrieveContext(supabase, task.org_id, task.prompt);

  let systemPrompt = SYSTEM_PROMPT;
  if (memoryContext.knowledge.length) {
    systemPrompt += `\n\n## Organization context:\n${memoryContext.knowledge.map((k) => `- ${k}`).join('\n')}`;
  }

  const result = await withTimeout(
    generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: task.prompt,
      tools,
      stopWhen: stepCountIs(25),
    }),
    TASK_TIMEOUT_MS,
    task.id,
  );

  const durationMs = Date.now() - startTime;

  await completeTask(supabase, task.id, result.text);

  // Post the result back into the conversation thread
  if (task.thread_id) {
    await supabase.from('messages').insert({
      thread_id: task.thread_id,
      role: 'assistant',
      content: `✅ Background task completed:\n\n${result.text}`,
      metadata: { backgroundTaskId: task.id },
    });

    await supabase
      .from('threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', task.thread_id);
  }

  // Track token usage
  trackUsage(supabase, {
    orgId: task.org_id,
    userId: task.user_id,
    threadId: task.thread_id,
    modelId: 'gemini-2.5-flash',
    modelProvider: 'google',
    promptTokens: result.usage?.promptTokens || 0,
    completionTokens: result.usage?.completionTokens || 0,
    latencyMs: durationMs,
    source: 'background_task',
  }).catch((err) => console.error('[worker] Usage tracking failed:', err));
}

/**
 * Claim and process the next queued task.
 * Returns `true` if a task was processed (success or failure), `false` if the queue was empty.
 */
export async function processNextTask(supabase: SupabaseClient): Promise<boolean> {
  const task = await claimNextTask(supabase);
  if (!task) return false;

  console.log(`[worker] Processing task ${task.id} (${task.type}): ${task.prompt.slice(0, 80)}...`);

  try {
    await executeTask(supabase, task);
    console.log(`[worker] Task ${task.id} completed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failTask(supabase, task.id, errorMessage);
    console.error(`[worker] Task ${task.id} failed:`, error);

    // Post failure notice into the thread so the user isn't left hanging
    if (task.thread_id) {
      await supabase.from('messages').insert({
        thread_id: task.thread_id,
        role: 'assistant',
        content: `⚠️ Background task failed: ${errorMessage}`,
        metadata: { backgroundTaskId: task.id, error: true },
      }).catch(() => {}); // best-effort
    }
  }

  return true; // processed (regardless of outcome) — continue draining
}
