/**
 * Subtask orchestration — lets Cooper spawn parallel work items.
 * 
 * Each subtask runs as an independent generateText call with its own
 * prompt, tools, and context. Results are collected and returned to
 * the parent agent.
 */

import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';

export interface SubtaskDefinition {
  id: string;
  description: string;
  prompt: string;
}

export interface SubtaskResult {
  id: string;
  description: string;
  status: 'success' | 'error' | 'timeout';
  output: string;
  durationMs: number;
  tokensUsed?: number;
}

const SUBTASK_TIMEOUT_MS = 60_000; // 1 minute per subtask
const MAX_CONCURRENT_SUBTASKS = 5;

function withTimeout<T>(promise: Promise<T>, ms: number, id: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Subtask "${id}" timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function executeSubtask(
  subtask: SubtaskDefinition,
  supabase: SupabaseClient,
  orgId: string,
): Promise<SubtaskResult> {
  const startTime = Date.now();

  try {
    const [tools, memoryContext] = await Promise.all([
      getToolsForOrg(supabase, orgId, undefined, { skipApproval: true }),
      retrieveContext(supabase, orgId, subtask.prompt),
    ]);

    let systemPrompt = `You are Cooper, executing a focused subtask. Be thorough but concise.`;
    if (memoryContext.knowledge.length) {
      systemPrompt += `\n\nOrg context:\n${memoryContext.knowledge.map(k => `- ${k}`).join('\n')}`;
    }

    const result = await withTimeout(
      generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        prompt: subtask.prompt,
        tools,
        stopWhen: stepCountIs(15),
      }),
      SUBTASK_TIMEOUT_MS,
      subtask.id,
    );

    return {
      id: subtask.id,
      description: subtask.description,
      status: 'success',
      output: result.text,
      durationMs: Date.now() - startTime,
      tokensUsed: result.usage?.totalTokens,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes('timed out');
    return {
      id: subtask.id,
      description: subtask.description,
      status: isTimeout ? 'timeout' : 'error',
      output: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple subtasks in parallel with concurrency limit.
 */
export async function executeSubtasks(
  subtasks: SubtaskDefinition[],
  supabase: SupabaseClient,
  orgId: string,
): Promise<SubtaskResult[]> {
  const results: SubtaskResult[] = [];

  // Execute in batches to respect concurrency limit
  for (let i = 0; i < subtasks.length; i += MAX_CONCURRENT_SUBTASKS) {
    const batch = subtasks.slice(i, i + MAX_CONCURRENT_SUBTASKS);
    console.log(`[orchestration] Executing batch of ${batch.length} subtasks (${i + 1}-${Math.min(i + batch.length, subtasks.length)} of ${subtasks.length})`);

    const batchResults = await Promise.allSettled(
      batch.map(subtask => executeSubtask(subtask, supabase, orgId))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          id: 'unknown',
          description: 'Failed subtask',
          status: 'error',
          output: String(result.reason),
          durationMs: 0,
        });
      }
    }
  }

  console.log(`[orchestration] All subtasks complete: ${results.filter(r => r.status === 'success').length}/${results.length} succeeded`);
  return results;
}
