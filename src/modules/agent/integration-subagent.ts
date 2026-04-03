/**
 * Integration Subagent — executes integration tasks in a separate model call
 * with Composio tools loaded. This keeps the main agent's token budget small.
 *
 * Instead of loading 50K+ tokens of Composio tool schemas on every request,
 * we only load them when the main agent explicitly needs an integration.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { google } from '@ai-sdk/google';
import { selectModel } from './model-router';

const INTEGRATION_SYSTEM_PROMPT = `You are an integration executor. Execute the instruction using your tools. Be direct, return the result.

Tool pattern:
1. COMPOSIO_SEARCH_TOOLS — find the action you need
2. COMPOSIO_MULTI_EXECUTE_TOOL — execute it

CRITICAL for Slack:
- FIRST search for "list channels" or "find channel" to get the channel ID
- THEN search for "send message" to find the posting action
- THEN post using the channel ID (not the channel name)
- Use Slack mrkdwn: *bold* (not **), no # headers, links as <url|text>

After executing, describe what happened in one sentence.
Never show raw API URLs, curl commands, or tool names.`;

/**
 * Create the use_integration tool for the main agent.
 * This is a lightweight tool that delegates to a subagent with Composio tools.
 */
export function createIntegrationTool(
  composioTools: Record<string, any>,
  connectedServices: string[]
) {
  return {
    use_integration: tool({
      description: `Execute ONE action on ONE connected integration (${connectedServices.join(', ')}). Call this once per service interaction. If a task involves multiple services (e.g., fetch from Calendar THEN post to Slack), make SEPARATE calls — one to fetch, then another to post with the actual data.`,
      inputSchema: z.object({
        instruction: z.string().describe(
          'A single, specific action. Examples: "get my Google Calendar events for this week", "post this message to #social on Slack: [actual content here]", "search PostHog for error events". Do NOT combine multiple services in one instruction.'
        ),
      }),
      execute: async ({ instruction }) => {
        try {
          console.log(`[integration-subagent] Executing: "${instruction.slice(0, 100)}"`);

          const modelSelection = selectModel(instruction, connectedServices);

          const result = await generateText({
            model: modelSelection.model,
            system: INTEGRATION_SYSTEM_PROMPT,
            prompt: instruction,
            tools: composioTools,
            stopWhen: stepCountIs(8),
            providerOptions: modelSelection.provider === 'google' ? {
              google: { thinkingConfig: { thinkingBudget: 512 } },
            } : undefined,
          });

          // Log all steps for debugging
          const steps = result.steps || [];
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const calls = step.toolCalls?.map((tc: any) => tc.toolName) || [];
            const results = step.toolResults?.map((tr: any) => {
              const val = (tr as any)?.result;
              const str = typeof val === 'string' ? val : JSON.stringify(val);
              return `${tr.toolName}: ${(str || '').slice(0, 200)}`;
            }) || [];
            console.log(`[integration-subagent] Step ${i}: tools=[${calls.join(', ')}] text="${(step.text || '').slice(0, 100)}" results=[${results.join(' | ')}]`);
          }

          // Get output — check text first, then fall back to last tool result
          let output = result.text || '';
          if (!output) {
            for (let i = steps.length - 1; i >= 0; i--) {
              const step = steps[i];
              if (step.text?.trim()) {
                output = step.text;
                break;
              }
              if (step.toolResults?.length) {
                const lastResult = step.toolResults[step.toolResults.length - 1];
                const resultVal = (lastResult as any)?.result;
                output = typeof resultVal === 'string'
                  ? resultVal
                  : JSON.stringify(resultVal)?.slice(0, 1000) || '';
                if (output) break;
              }
            }
          }
          if (!output) output = 'Done (no text output)';

          const toolsUsed = result.steps
            ?.flatMap(s => s.toolCalls?.map(tc => tc.toolName) || [])
            .filter(Boolean) || [];

          console.log(`[integration-subagent] Done. Tools used: ${toolsUsed.join(', ') || 'none'}. Output: ${output.slice(0, 200)}`);

          return {
            result: output,
            toolsUsed,
            success: true,
          };
        } catch (error) {
          console.error('[integration-subagent] Failed:', error);
          return {
            result: `Integration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            success: false,
          };
        }
      },
    }),
  };
}
