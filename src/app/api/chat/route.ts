import { UIMessage, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';
import { getConnectionsForUser } from '@/modules/connections/db';
import { getToolsForUser } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';
import { summarizeAndStoreThread } from '@/modules/memory/thread-summary';
import { trackUsage } from '@/modules/observability/usage';
import { reflectOnResponse } from '@/modules/agent/reflection';
// generateSuggestions removed — suggestions now come from the model's response text
import { generateThreadTitle } from '@/modules/agent/title-generator';
import { evaluateAndLearnSkill } from '@/modules/skills/learner';
import { evaluateSkillPerformance } from '@/modules/skills/improver';
import { trackMatchedSkills } from '@/modules/skills/tracker';
import { logActivity } from '@/modules/observability/activity';
import type { ChatMessage, SuggestionData, StatusData } from '@/lib/chat-types';

export const maxDuration = 60;

function extractText(parts: UIMessage['parts'] | undefined): string {
  return parts
    ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('') || '';
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get the user's org
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('org_id, timezone, model_preference')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    console.error('[chat] User not found in DB:', { userId: user.id, error: dbError });
    return new Response('User not found', { status: 404 });
  }

  // Get org-level model preference
  const { data: dbOrg } = await supabase
    .from('organizations')
    .select('model_preference')
    .eq('id', dbUser.org_id)
    .single();

  const { messages, threadId, modelOverride } = (await req.json()) as {
    messages: UIMessage[];
    threadId?: string;
    modelOverride?: string;
  };

  // Create or reuse thread
  const requestStartTime = Date.now();
  let activeThreadId = threadId;
  if (!activeThreadId || activeThreadId === 'new') {
    const lastUserMessage = messages[messages.length - 1];
    const title =
      extractText(lastUserMessage?.parts).slice(0, 100) || 'New conversation';

    const { data: thread } = await supabase
      .from('threads')
      .insert({
        org_id: dbUser.org_id,
        user_id: user.id,
        title,
      })
      .select('id')
      .single();

    if (!thread) {
      return new Response('Failed to create thread', { status: 500 });
    }
    activeThreadId = thread.id;
  }

  // Save the latest user message
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === 'user') {
    const content = extractText(lastUserMessage.parts);

    const { error: msgError } = await supabase.from('messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content,
    });
    console.log(`[chat] Saved user message to ${activeThreadId}: ${content.slice(0, 50)}... error=${msgError?.message || 'none'}`);
  } else {
    console.log(`[chat] No user message to save. Last message role: ${lastUserMessage?.role}`);
  }

  const agentInput = {
    threadId: activeThreadId!,
    orgId: dbUser.org_id,
    userId: user.id,
    uiMessages: messages,
  };

  // Load tools and connection names
  const tools = await getToolsForUser(supabase, dbUser.org_id, user.id);
  console.log(`[chat] Loaded ${Object.keys(tools).length} connection tools:`, Object.keys(tools).slice(0, 10));

  // Use the same visibility rules for the prompt that we use for tool loading.
  const visibleConnections = await getConnectionsForUser(supabase, dbUser.org_id, user.id);
  const connectedServices = [...new Set(visibleConnections.map((connection) => connection.name))];

  // Retrieve memory context
  const lastMsg = messages[messages.length - 1];
  const userText = extractText(lastMsg?.parts);

  const memoryContext = userText.trim()
    ? await retrieveContext(supabase, dbUser.org_id, user.id, userText)
    : { knowledge: [], matchedSkills: [], threadSummaries: [] };

  const requestedModel = modelOverride && modelOverride !== 'auto'
    ? modelOverride
    : dbUser.model_preference && dbUser.model_preference !== 'auto'
      ? dbUser.model_preference
      : undefined;

  let resolveAgentRun: ((value: Awaited<ReturnType<typeof createAgentStream>>) => void) | null = null;
  let rejectAgentRun: ((reason?: unknown) => void) | null = null;
  const agentRunReady = new Promise<Awaited<ReturnType<typeof createAgentStream>>>((resolve, reject) => {
    resolveAgentRun = resolve;
    rejectAgentRun = reject;
  });

  // Use Next.js after() to run background work after response is sent.
  // This keeps the serverless function alive until all work completes.
  let streamedAssistantMessage: ChatMessage | null = null;
  let streamedSuggestions: SuggestionData[] = [];
  after(async () => {
    try {
      const agentRun = await agentRunReady;
      const { result, modelSelection } = agentRun;
      const fullText = await result.text;
      console.log(`[chat] after() running. threadId=${activeThreadId}, textLength=${fullText?.length || 0}`);
      if (!activeThreadId) return;

      const { createClient: createServerClient } = await import(
        '@/lib/supabase/server'
      );
      const sb = await createServerClient();

      // Collect tool calls from steps
      const toolCallSummary: string[] = [];
      try {
        const steps = await result.steps;
        for (const step of steps) {
          for (const tc of step.toolCalls || []) {
            toolCallSummary.push(tc.toolName);
          }
        }
      } catch { /* steps may not be available */ }

      const persistedParts = streamedAssistantMessage
        ? [
            ...streamedAssistantMessage.parts,
            ...(streamedSuggestions.length > 0
              ? [{ type: 'data-suggestions' as const, data: streamedSuggestions }]
              : []),
          ]
        : undefined;
      const content = fullText || extractText(streamedAssistantMessage?.parts);

      if (content) {
        await sb.from('messages').insert({
          thread_id: activeThreadId,
          role: 'assistant',
          content,
          tool_calls: toolCallSummary.length > 0 ? toolCallSummary : null,
          metadata: {
            model: modelSelection.modelId,
            provider: modelSelection.provider,
            toolsUsed: toolCallSummary,
            parts: persistedParts,
          },
        });
      }
      await sb
        .from('threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeThreadId);

      // Track skill usage (non-blocking)
      if (memoryContext.matchedSkills.length > 0) {
        trackMatchedSkills(sb, memoryContext.matchedSkills)
          .catch(err => console.error('[chat] Skill usage tracking failed:', err));
      }

      // Track token usage and costs
      try {
        const totalUsage = await result.totalUsage;
        console.log('[chat] Token usage:', JSON.stringify(totalUsage));
        if (totalUsage && (totalUsage.inputTokens || totalUsage.outputTokens)) {
          await trackUsage(sb, {
            orgId: dbUser.org_id,
            userId: user.id,
            threadId: activeThreadId,
            modelId: modelSelection.modelId,
            modelProvider: modelSelection.provider,
            promptTokens: totalUsage.inputTokens || 0,
            completionTokens: totalUsage.outputTokens || 0,
            latencyMs: Date.now() - requestStartTime,
            source: 'chat',
          });
        }
      } catch (err) {
        console.error('[chat] Usage tracking failed:', err);
      }

      // Log activity
      logActivity(sb, dbUser.org_id, toolCallSummary.length > 0 ? 'tool_call' : 'thread_created',
        toolCallSummary.length > 0
          ? `Used ${toolCallSummary.length} tool(s): ${toolCallSummary.slice(0, 3).join(', ')}${toolCallSummary.length > 3 ? '...' : ''}`
          : `Responded to: "${userText.slice(0, 80)}${userText.length > 80 ? '...' : ''}"`,
        { threadId: activeThreadId, userId: user.id, toolName: toolCallSummary[0] }
      ).catch(err => console.error('[chat] Activity logging failed:', err));

      // Background: self-reflect on complex responses
      if (toolCallSummary.length >= 3 && fullText) {
        reflectOnResponse(userText, fullText, toolCallSummary)
          .then(async (reflection) => {
            if (reflection && reflection.quality !== 'good') {
              console.log(`[reflection] Quality: ${reflection.quality}`, reflection.issues);
              // Store reflection as metadata on the message for future context
              await sb.from('messages')
                .update({
                  metadata: {
                    model: modelSelection.modelId,
                    provider: modelSelection.provider,
                    toolsUsed: toolCallSummary,
                    parts: persistedParts,
                    reflection: {
                      quality: reflection.quality,
                      issues: reflection.issues,
                      suggestion: reflection.suggestion,
                    },
                  },
                })
                .eq('thread_id', activeThreadId)
                .eq('role', 'assistant')
                .order('created_at', { ascending: false })
                .limit(1);
            }
          })
          .catch((err) => console.error('[reflection] Failed:', err));
      }

      // Background: extract and save memories from this exchange
      extractAndSaveMemories(
        sb,
        dbUser.org_id,
        user.id,
        userText,
        fullText || '',
        memoryContext.knowledge
      ).catch((err) => {
        console.error('[chat] Memory extraction failed:', err);
      });

      // Background: summarize thread for cross-thread recall
      summarizeAndStoreThread(sb, activeThreadId, dbUser.org_id, user.id).catch(
        (err) => {
          console.error('[chat] Thread summarization failed:', err);
        }
      );

      // Background: generate a smart title for the thread
      generateThreadTitle(sb, activeThreadId, userText, fullText || '')
        .catch((err) => console.error('[chat] Title generation failed:', err));

      // Suggestions are now written directly into the stream (see below)

      // Background: auto-learn reusable skills from complex interactions
      if (toolCallSummary.length >= 3 && fullText) {
        evaluateAndLearnSkill(
          sb,
          dbUser.org_id,
          userText,
          fullText,
          toolCallSummary
        )
          .then((result) => {
            if (result.learned) {
              console.log(
                `[chat] Auto-learned skill: ${result.skillName}`
              );
            }
          })
          .catch((err) =>
            console.error('[chat] Skill learning failed:', err)
          );
      }

      // Background: improve existing skills based on actual execution
      if (toolCallSummary.length >= 2 && fullText && memoryContext.matchedSkills.length > 0) {
        for (const matchedSkill of memoryContext.matchedSkills) {
          evaluateSkillPerformance(
            sb,
            dbUser.org_id,
            matchedSkill.name,
            userText,
            fullText,
            toolCallSummary
          ).catch((err) =>
            console.error(
              `[chat] Skill improvement failed for "${matchedSkill.name}":`,
              err
            )
          );
        }
      }
    } catch (err: unknown) {
      console.error('[chat] Failed to persist assistant response:', err);
      if (err && typeof err === 'object') {
        const errorRecord = err as Record<string, unknown>;
        console.error('[chat] Error name:', errorRecord.name, 'message:', errorRecord.message);
      }
      // Save error to thread so the user sees feedback
      if (activeThreadId) {
        try {
          const { createClient: createServerClient } = await import('@/lib/supabase/server');
          const sb = await createServerClient();
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          await sb.from('messages').insert({
            thread_id: activeThreadId,
            role: 'assistant',
            content: `Sorry, I ran into an issue while processing your request. Please try again! 🔄\n\n_Error: ${errorMessage}_`,
            metadata: { error: true },
          });
        } catch { /* last resort, nothing we can do */ }
      }
    }
  });

  // Wrap the LLM stream so we can append suggestions after it finishes
  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const pushStatus = (status: StatusData) => {
        writer.write({
          type: 'data-status',
          data: status,
          transient: true,
        });
      };

      const { result, modelSelection } = await createAgentStream({
        ...agentInput,
        modelOverride: requestedModel,
        orgModelPreference: dbOrg?.model_preference && dbOrg.model_preference !== 'auto' ? dbOrg.model_preference : undefined,
        tools,
        memoryContext,
        supabase,
        connectedServices,
        timezone: dbUser.timezone || 'America/Los_Angeles',
        onStatusUpdate: pushStatus,
      });
      resolveAgentRun?.({ result, modelSelection });

      // Merge the LLM stream first
      writer.merge(
        result.toUIMessageStream<ChatMessage>({
          originalMessages: messages as ChatMessage[],
          sendReasoning: true,
          onFinish: ({ responseMessage }) => {
            streamedAssistantMessage = responseMessage;
          },
        })
      );

      // Wait for the full text so we can generate suggestions
      const fullText = await result.text;
      const toolCallSummary: string[] = [];
      try {
        const steps = await result.steps;
        for (const step of steps) {
          for (const tc of step.toolCalls || []) {
            toolCallSummary.push(tc.toolName);
          }
        }
      } catch { /* steps may not be available */ }

      // Suggestions are now generated by the model in its response text.
      // No separate LLM call needed — saves tokens and latency.
    },
    onError: (error) => {
      rejectAgentRun?.(error);
      return error instanceof Error ? error.message : 'Unknown stream error';
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      'X-Thread-Id': activeThreadId || '',
    },
  });
}
