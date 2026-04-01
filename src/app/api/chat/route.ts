import { UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';
import { summarizeAndStoreThread } from '@/modules/memory/thread-summary';
import { trackUsage } from '@/modules/observability/usage';
import { reflectOnResponse } from '@/modules/agent/reflection';
import { generateSuggestions } from '@/modules/agent/suggestions';
import { generateThreadTitle } from '@/modules/agent/title-generator';
import { evaluateAndLearnSkill } from '@/modules/skills/learner';
import { evaluateSkillPerformance } from '@/modules/skills/improver';
import { trackMatchedSkills } from '@/modules/skills/tracker';
import { logActivity } from '@/modules/observability/activity';

export const maxDuration = 60;

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
    .select('org_id, timezone')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    console.error('[chat] User not found in DB:', { userId: user.id, error: dbError });
    return new Response('User not found', { status: 404 });
  }

  const { messages, threadId } = (await req.json()) as {
    messages: UIMessage[];
    threadId?: string;
  };

  // Create or reuse thread
  let activeThreadId = threadId;
  if (!activeThreadId || activeThreadId === 'new') {
    const lastUserMessage = messages[messages.length - 1];
    const title =
      lastUserMessage?.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('')
        .slice(0, 100) || 'New conversation';

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
    const content =
      lastUserMessage.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('') || '';

    await supabase.from('messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content,
    });
  }

  const agentInput = {
    threadId: activeThreadId!,
    orgId: dbUser.org_id,
    userId: user.id,
    uiMessages: messages,
  };

  // Load tools and connection names
  const tools = await getToolsForOrg(supabase, dbUser.org_id, user.id);
  console.log(`[chat] Loaded ${Object.keys(tools).length} connection tools:`, Object.keys(tools).slice(0, 10));

  // Get connected service names for the system prompt
  const { data: activeConnections } = await supabase
    .from('connections')
    .select('name')
    .eq('org_id', dbUser.org_id)
    .eq('status', 'active');
  const connectedServices = (activeConnections || []).map((c: any) => c.name);

  // Retrieve memory context
  const lastMsg = messages[messages.length - 1];
  const userText = lastMsg?.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('') || '';

  const memoryContext = userText.trim()
    ? await retrieveContext(supabase, dbUser.org_id, userText)
    : { knowledge: [], matchedSkills: [], threadSummaries: [] };

  let result;
  try {
    result = await createAgentStream({
      ...agentInput,
      tools,
      memoryContext,
      supabase,
      connectedServices,
      timezone: dbUser.timezone || 'America/Los_Angeles',
    });
  } catch (error) {
    console.error('[chat] Failed to create agent stream:', error);
    // Save error message so the user sees something
    if (activeThreadId) {
      await supabase.from('messages').insert({
        thread_id: activeThreadId,
        role: 'assistant',
        content: "I'm sorry, I ran into an error processing your request. Please try again. If this keeps happening, try a simpler message first.",
        metadata: { error: true, errorMessage: String(error) },
      });
    }
    return new Response('Internal error', { status: 500 });
  }

  // Save the assistant response after streaming completes
  const modelUsed = 'gemini-flash';
  Promise.resolve(result.text).then(async (fullText) => {
    if (activeThreadId) {
      const { createClient: createServerClient } = await import(
        '@/lib/supabase/server'
      );
      const sb = await createServerClient();

      // Collect tool calls from steps
      let toolCallSummary: string[] = [];
      try {
        const steps = await result.steps;
        for (const step of steps) {
          for (const tc of step.toolCalls || []) {
            toolCallSummary.push(tc.toolName);
          }
        }
      } catch { /* steps may not be available */ }

      // Build a complete content that includes tool call context
      let content = fullText || '';
      if (toolCallSummary.length > 0 && content) {
        // Prepend a note about what tools were used (hidden from display but preserved for history)
        content = content;
      }

      if (content) {
        await sb.from('messages').insert({
          thread_id: activeThreadId,
          role: 'assistant',
          content,
          tool_calls: toolCallSummary.length > 0 ? toolCallSummary : null,
          metadata: { model: modelUsed, toolsUsed: toolCallSummary },
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
        const usage = await result.usage;
        const totalUsage = await result.totalUsage;
        const effectiveUsage = totalUsage || usage;
        console.log('[chat] Usage:', JSON.stringify(effectiveUsage));
        if (effectiveUsage) {
          trackUsage(sb, {
            orgId: dbUser.org_id,
            userId: user.id,
            threadId: activeThreadId,
            modelId: modelUsed,
            modelProvider: 'google',
            promptTokens: effectiveUsage.inputTokens || 0,
            completionTokens: effectiveUsage.outputTokens || 0,
            latencyMs: undefined,
            source: 'chat',
          }).catch(err => console.error('[chat] Usage tracking failed:', err));
        }
      } catch { /* non-critical */ }

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
                    model: modelUsed,
                    toolsUsed: toolCallSummary,
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
        userText,
        fullText || '',
        memoryContext.knowledge
      ).catch((err) => {
        console.error('[chat] Memory extraction failed:', err);
      });

      // Background: summarize thread for cross-thread recall
      summarizeAndStoreThread(sb, activeThreadId, dbUser.org_id).catch(
        (err) => {
          console.error('[chat] Thread summarization failed:', err);
        }
      );

      // Background: generate a smart title for the thread
      generateThreadTitle(sb, activeThreadId, userText, fullText || '')
        .catch((err) => console.error('[chat] Title generation failed:', err));

      // Background: generate proactive follow-up suggestions
      if (toolCallSummary.length > 0 && fullText) {
        generateSuggestions(userText, fullText, toolCallSummary, connectedServices)
          .then(async (suggestions) => {
            if (suggestions.length > 0) {
              console.log(`[suggestions] Generated ${suggestions.length} follow-ups:`, suggestions.map(s => s.text));
              // TODO: Store suggestions on thread once metadata column is added
              // For now, suggestions are generated by the system prompt directly in responses
            }
          })
          .catch((err) => console.error('[suggestions] Failed:', err));
      }

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
    }
  }).catch((err) => {
    console.error('[chat] Failed to persist assistant response:', err);
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    headers: {
      'X-Thread-Id': activeThreadId || '',
    },
  });
}
