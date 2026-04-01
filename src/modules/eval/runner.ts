/**
 * Eval runner — executes test cases against the agent engine.
 */

import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import type { EvalCase, EvalResult, EvalSuiteResult } from './types';

/**
 * Run a single eval case.
 */
async function runCase(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();
  const failures: string[] = [];

  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: 'You are Cooper, an AI teammate. Respond helpfully and concisely.',
      prompt: evalCase.input,
      stopWhen: stepCountIs(evalCase.expectations.maxSteps || 15),
    });

    const response = result.text || '';
    const toolCalls = result.steps?.flatMap(s =>
      (s.toolCalls || []).map((tc: any) => tc.toolName)
    ) || [];
    const steps = result.steps?.length || 0;

    // Check expectations
    const exp = evalCase.expectations;

    if (exp.shouldRespond !== false && !response.trim()) {
      failures.push('Expected a response but got empty');
    }

    if (exp.shouldUseTool) {
      for (const tool of exp.shouldUseTool) {
        if (!toolCalls.includes(tool)) {
          failures.push(`Expected tool call: ${tool}`);
        }
      }
    }

    if (exp.shouldNotUseTool) {
      for (const tool of exp.shouldNotUseTool) {
        if (toolCalls.includes(tool)) {
          failures.push(`Unexpected tool call: ${tool}`);
        }
      }
    }

    if (exp.outputContains) {
      for (const pattern of exp.outputContains) {
        if (!response.toLowerCase().includes(pattern.toLowerCase())) {
          failures.push(`Output missing expected pattern: "${pattern}"`);
        }
      }
    }

    if (exp.outputNotContains) {
      for (const pattern of exp.outputNotContains) {
        if (response.toLowerCase().includes(pattern.toLowerCase())) {
          failures.push(`Output contains forbidden pattern: "${pattern}"`);
        }
      }
    }

    if (exp.maxSteps && steps > exp.maxSteps) {
      failures.push(`Exceeded max steps: ${steps} > ${exp.maxSteps}`);
    }

    if (exp.customValidator && !exp.customValidator(response, toolCalls)) {
      failures.push('Custom validator failed');
    }

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      passed: failures.length === 0,
      response: response.slice(0, 500),
      toolCalls,
      steps,
      durationMs: Date.now() - startTime,
      tokenUsage: {
        prompt: result.usage?.inputTokens || 0,
        completion: result.usage?.outputTokens || 0,
        total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
      },
      failures,
    };
  } catch (error) {
    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      passed: false,
      response: '',
      toolCalls: [],
      steps: 0,
      durationMs: Date.now() - startTime,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      failures: [`Error: ${String(error).slice(0, 200)}`],
    };
  }
}

/**
 * Run a suite of eval cases.
 */
export async function runEvalSuite(
  suiteName: string,
  cases: EvalCase[],
  options?: { concurrency?: number }
): Promise<EvalSuiteResult> {
  const startTime = Date.now();
  const concurrency = options?.concurrency || 3;
  const results: EvalResult[] = [];

  // Run in batches
  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    console.log(`[eval] Running batch ${Math.floor(i / concurrency) + 1}: ${batch.map(c => c.name).join(', ')}`);
    
    const batchResults = await Promise.all(batch.map(runCase));
    results.push(...batchResults);

    for (const r of batchResults) {
      const icon = r.passed ? '✓' : '✗';
      console.log(`[eval] ${icon} ${r.caseName} (${r.durationMs}ms, ${r.tokenUsage.total} tokens)${r.failures.length ? ' — ' + r.failures.join('; ') : ''}`);
    }
  }

  return {
    suiteName,
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
    durationMs: Date.now() - startTime,
  };
}
