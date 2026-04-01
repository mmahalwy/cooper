import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { updateTaskAfterRun, createExecutionLog, updateScheduledTaskStatus, clearTaskLock, recordTaskFailure, resetTaskFailures } from './db';
import { getNextRunTime } from './matcher';
import type { ScheduledTask } from '@/lib/types';
import { trackUsage } from '@/modules/observability/usage';

const TASK_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes

function withTimeout<T>(promise: Promise<T>, ms: number, taskId: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Task ${taskId} timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const SYSTEM_PROMPT = `You are Cooper, an AI teammate executing a scheduled task.
Complete the task described below. Be thorough but concise in your output.
Use any available tools to get the information needed.`;

export async function executeScheduledTask(
  supabase: SupabaseClient,
  task: ScheduledTask
): Promise<void> {
  // Check if schedule has expired
  if (task.ends_at && new Date(task.ends_at) <= new Date()) {
    console.log(`[scheduler] Task ${task.id} expired (ends_at: ${task.ends_at}), pausing`);
    await updateScheduledTaskStatus(supabase, task.id, 'paused');
    return;
  }

  const startTime = Date.now();

  const log = await createExecutionLog(supabase, {
    task_id: task.id,
    status: 'running',
  });

  try {
    const { data: thread } = await supabase
      .from('threads')
      .insert({
        org_id: task.org_id,
        user_id: task.user_id,
        title: `[Scheduled] ${task.name}`,
        scheduled_task_id: task.id,
      })
      .select('id')
      .single();

    const tools = await getToolsForOrg(supabase, task.org_id, undefined, { skipApproval: true });
    const memoryContext = await retrieveContext(supabase, task.org_id, task.prompt);

    let systemPrompt = SYSTEM_PROMPT;
    if (memoryContext.knowledge.length) {
      systemPrompt += `\n\n## Organization context:\n${memoryContext.knowledge.map((k) => `- ${k}`).join('\n')}`;
    }

    const allTools = { ...tools };

    const result = await withTimeout(generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: task.prompt,
      tools: allTools,
      stopWhen: stepCountIs(10),
    }), TASK_TIMEOUT_MS, task.id);

    const durationMs = Date.now() - startTime;

    if (thread?.id) {
      // Save the prompt and only the final step's text (not all intermediate steps concatenated)
      const steps = result.steps || [];
      const finalText = steps.length > 0
        ? steps[steps.length - 1].text || result.text
        : result.text;

      await supabase.from('messages').insert([
        { thread_id: thread.id, role: 'user', content: task.prompt },
        { thread_id: thread.id, role: 'assistant', content: finalText, metadata: { scheduled: true, task_id: task.id } },
      ]);
    }

    if (log?.id) {
      await supabase
        .from('execution_logs')
        .update({
          status: 'success',
          output: result.text,
          thread_id: thread?.id,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          tokens_used: result.usage?.totalTokens,
        })
        .eq('id', log.id);
    }

    // Track usage
    trackUsage(supabase, {
      orgId: task.org_id,
      userId: task.user_id,
      threadId: thread?.id,
      modelId: 'gemini-2.5-flash',
      modelProvider: 'google',
      promptTokens: result.usage?.promptTokens || 0,
      completionTokens: result.usage?.completionTokens || 0,
      latencyMs: durationMs,
      source: 'scheduler',
    }).catch(err => console.error('[scheduler] Usage tracking failed:', err));

    await resetTaskFailures(supabase, task.id);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (log?.id) {
      await supabase
        .from('execution_logs')
        .update({
          status: 'error',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', log.id);
    }

    console.error(`[scheduler] Task ${task.id} failed:`, error);
    await recordTaskFailure(supabase, task.id);
  } finally {
    await clearTaskLock(supabase, task.id);
    const nextRun = getNextRunTime(task.cron);
    await updateTaskAfterRun(supabase, task.id, nextRun.toISOString());
  }
}
