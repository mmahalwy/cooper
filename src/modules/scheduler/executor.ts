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
Use any available tools to get the information needed.

## Slack Formatting
When posting messages to Slack, use Slack's mrkdwn syntax — NOT Markdown:
- Bold: *bold* (single asterisks, not double)
- Italic: _italic_ (underscores)
- Strikethrough: ~strikethrough~
- Code: \`code\` (backticks work the same)
- Bulleted list: use "• " or "- " at the start of lines
- Links: <https://example.com|Link text>
- NO headers (no # or ##) — use *bold text* on its own line instead
- NO ** for bold — that renders literally in Slack
- Keep messages concise and scannable`;

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
      const messages: Array<{ thread_id: string; role: string; content: string; metadata?: any }> = [
        { thread_id: thread.id, role: 'user', content: task.prompt },
      ];

      // Save each step as a message so the full conversation is visible
      const steps = result.steps || [];
      for (const step of steps) {
        // Save tool call summaries
        if (step.toolCalls?.length) {
          const toolSummary = step.toolCalls.map((tc: any) => {
            const resultEntry = step.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId);
            const output = resultEntry?.result;
            const outputPreview = typeof output === 'string'
              ? output.slice(0, 500)
              : JSON.stringify(output)?.slice(0, 500) || '';
            return `**${tc.toolName}**\n${outputPreview}`;
          }).join('\n\n');
          if (toolSummary) {
            messages.push({ thread_id: thread.id, role: 'assistant', content: toolSummary, metadata: { scheduled: true, type: 'tool_calls' } });
          }
        }
        // Save text output
        if (step.text?.trim()) {
          messages.push({ thread_id: thread.id, role: 'assistant', content: step.text, metadata: { scheduled: true, task_id: task.id } });
        }
      }

      // If no messages beyond the prompt, save a fallback
      if (messages.length === 1) {
        messages.push({ thread_id: thread.id, role: 'assistant', content: result.text || '(No output generated)', metadata: { scheduled: true, task_id: task.id } });
      }

      await supabase.from('messages').insert(messages);
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
    await recordTaskFailure(supabase, task.id, errorMessage);
  } finally {
    await clearTaskLock(supabase, task.id);
    const nextRun = getNextRunTime(task.cron);
    await updateTaskAfterRun(supabase, task.id, nextRun.toISOString());
  }
}
