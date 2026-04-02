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

const INTEGRATION_SYSTEM_PROMPT = `You are an integration executor. You have access to connected services via tools.

Your job: execute the instruction given to you using the available tools. Be direct and return the result.

How to use your tools:
1. Use COMPOSIO_SEARCH_TOOLS to find the right action for a service
2. Use COMPOSIO_GET_TOOL_SCHEMAS to check parameter details if needed
3. Use COMPOSIO_MULTI_EXECUTE_TOOL to execute the action
4. For Slack/email: always look up the channel/recipient ID first before sending

When posting to Slack, use Slack mrkdwn (not Markdown):
- Bold: *bold* (single asterisks, NOT **)
- NO headers (# or ##)
- Links: <https://url|text>

Return the result concisely. Don't explain what tools you used — just give the output.
Never show raw API URLs, curl commands, or internal tool names.`;

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
      description: `Execute an action on a connected integration (${connectedServices.join(', ')}). Use this whenever you need to interact with a connected service — reading data, sending messages, creating records, searching, etc. Describe what you need done in plain language.`,
      inputSchema: z.object({
        instruction: z.string().describe(
          'What to do, e.g. "get my Google Calendar events for this week", "post a message to #social on Slack saying hello", "search PostHog for error events in the last 24 hours"'
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

          const output = result.text || '(No output from integration)';
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
