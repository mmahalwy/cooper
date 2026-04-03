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
import { getToolStatus } from './status';

const INTEGRATION_SYSTEM_PROMPT = `You are an integration executor. Execute the instruction and return the ACTUAL DATA.

Tool pattern:
1. COMPOSIO_SEARCH_TOOLS — find the action you need
2. COMPOSIO_MULTI_EXECUTE_TOOL — execute it

CRITICAL: After executing a tool, include the ACTUAL DATA in your response. DO NOT just say "successfully retrieved" or "listed the files". Return the real content — file contents, list of items, search results, etc. The caller needs the data, not a confirmation message.

For Slack: search for channel ID first, then send using the ID (not name). Use mrkdwn: *bold*, no # headers.
If a Slack action fails with "not_in_channel", tell the user: "I'm not a member of that channel. Please invite me with /invite @Cooper and try again."`;

/**
 * Create the use_integration tool for the main agent.
 * This is a lightweight tool that delegates to a subagent with Composio tools.
 */
export function createIntegrationTool(
  composioTools: Record<string, any>,
  connectedServices: string[],
  onStatusUpdate?: (status: {
    message: string;
    source: 'agent' | 'integration';
    step?: number;
    toolName?: string;
  }) => void,
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
          onStatusUpdate?.({
            message: 'Starting integration task...',
            source: 'integration',
          });

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
            onStepFinish: ({ stepNumber, toolCalls }) => {
              if (!toolCalls || toolCalls.length === 0) return;

              for (const toolCall of toolCalls) {
                const input = typeof toolCall.input === 'object' && toolCall.input !== null
                  ? toolCall.input as Record<string, unknown>
                  : undefined;
                onStatusUpdate?.({
                  message: getToolStatus(toolCall.toolName, input),
                  source: 'integration',
                  step: stepNumber + 1,
                  toolName: toolCall.toolName,
                });
              }
            },
          });

          // Extract output — AI SDK tool results use .output (not .result)
          const steps = result.steps || [];

          // Log steps for debugging
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const calls = step.toolCalls?.map((tc: any) => tc.toolName) || [];
            const outputs = step.toolResults?.map((tr: any) => {
              const val = tr.output;
              const str = typeof val === 'string' ? val : JSON.stringify(val);
              return `${tr.toolName}: ${(str || '(empty)').slice(0, 200)}`;
            }) || [];
            console.log(`[integration-subagent] Step ${i}: tools=[${calls.join(', ')}] text="${(step.text || '').slice(0, 100)}" outputs=[${outputs.join(' | ')}]`);
          }

          // Get output: prefer result.text, then last tool output, then concatenated texts
          // Check if result.text is a vague summary vs actual content
          const isVagueSummary = (text: string) =>
            /^(I have |The .* (was|were|has been) (successfully|retrieved|listed|fetched|completed)|Done|Successfully)/i.test(text.trim());

          let output = result.text && !isVagueSummary(result.text) ? result.text : '';

          if (!output) {
            // Walk backwards through steps to find actual data from tool outputs
            for (let i = steps.length - 1; i >= 0; i--) {
              const step = steps[i];
              // Prefer tool output data over model text summaries
              if (step.toolResults?.length) {
                const lastResult = step.toolResults[step.toolResults.length - 1] as any;
                const val = lastResult?.output;
                if (val != null) {
                  const raw = typeof val === 'string' ? val : JSON.stringify(val);
                  // Only use if it has actual content (not just metadata)
                  if (raw && raw.length > 50 && raw !== '{}' && raw !== 'null') {
                    output = raw.slice(0, 3000); // cap size
                    break;
                  }
                }
              }
              if (step.text?.trim() && !isVagueSummary(step.text)) {
                output = step.text;
                break;
              }
            }
          }
          if (!output) {
            output = steps.map(s => s.text?.trim()).filter(Boolean).join('\n\n');
          }
          if (!output) output = 'The integration completed but returned no readable output.';

          // Detect common Slack errors in tool outputs and surface them
          const allOutputs = steps.flatMap(s => (s.toolResults || []).map((tr: any) => {
            const val = tr?.output;
            return typeof val === 'string' ? val : JSON.stringify(val || '');
          })).join(' ');
          if (allOutputs.includes('not_in_channel')) {
            output = "I'm not a member of that Slack channel. Please invite me with `/invite @Cooper` in the channel, then try again.";
          } else if (allOutputs.includes('channel_not_found')) {
            output = "I couldn't find that Slack channel. Please check the channel name and try again.";
          } else if (allOutputs.includes('missing_scope')) {
            output = "I don't have the right permissions for that action. The Slack app may need to be reinstalled with updated scopes.";
          }

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
