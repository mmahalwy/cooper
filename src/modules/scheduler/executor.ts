import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { updateTaskAfterRun, createExecutionLog } from './db';
import { getNextRunTime } from './matcher';
import type { ScheduledTask } from '@/lib/types';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate executing a scheduled task.
Complete the task described below. Be thorough but concise in your output.
Use any available tools to get the information needed.`;

export async function executeScheduledTask(
  supabase: SupabaseClient,
  task: ScheduledTask
): Promise<void> {
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
      })
      .select('id')
      .single();

    const tools = await getToolsForOrg(supabase, task.org_id);
    const memoryContext = await retrieveContext(supabase, task.org_id, task.prompt);

    let systemPrompt = SYSTEM_PROMPT;
    if (memoryContext.knowledge.length) {
      systemPrompt += `\n\n## Organization context:\n${memoryContext.knowledge.map((k) => `- ${k}`).join('\n')}`;
    }

    const builtInTools = {
      google_search: google.tools.googleSearch({}),
    };
    const allTools = { ...builtInTools, ...tools };

    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: task.prompt,
      tools: allTools,
      stopWhen: stepCountIs(10),
    });

    const durationMs = Date.now() - startTime;

    if (thread?.id) {
      await supabase.from('messages').insert([
        { thread_id: thread.id, role: 'user', content: task.prompt },
        { thread_id: thread.id, role: 'assistant', content: result.text, metadata: { scheduled: true, task_id: task.id } },
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
  } finally {
    const nextRun = getNextRunTime(task.cron);
    await updateTaskAfterRun(supabase, task.id, nextRun.toISOString());
  }
}
