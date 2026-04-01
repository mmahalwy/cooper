import { UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';
import { summarizeAndStoreThread } from '@/modules/memory/thread-summary';
import { trackUsage } from '@/modules/observability/usage';

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
    .select('org_id')
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

  const result = await createAgentStream({
    ...agentInput,
    tools,
    memoryContext,
    supabase,
    connectedServices,
  });

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

      // Track token usage and costs
      try {
        const usage = await result.usage;
        if (usage) {
          trackUsage(sb, {
            orgId: dbUser.org_id,
            userId: user.id,
            threadId: activeThreadId,
            modelId: modelUsed,
            modelProvider: 'google',
            promptTokens: usage.promptTokens || 0,
            completionTokens: usage.completionTokens || 0,
            latencyMs: undefined, // TODO: track request start time
            source: 'chat',
          }).catch(err => console.error('[chat] Usage tracking failed:', err));
        }
      } catch { /* non-critical */ }

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
