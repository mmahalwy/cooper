import { UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';

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
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join(''),
    })),
  };

  // Load tools for this org's connections
  const tools = await getToolsForOrg(supabase, dbUser.org_id, user.id);

  // Retrieve memory context
  const lastMsg = messages[messages.length - 1];
  const userText = lastMsg?.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('') || '';

  const memoryContext = await retrieveContext(supabase, dbUser.org_id, userText);

  const result = await createAgentStream({
    ...agentInput,
    tools,
    memoryContext,
    supabase,
  });

  // Save the assistant response after streaming completes
  const modelUsed = 'gemini-flash';
  Promise.resolve(result.text).then(async (text) => {
    if (text && activeThreadId) {
      const { createClient: createServerClient } = await import(
        '@/lib/supabase/server'
      );
      const sb = await createServerClient();
      await sb.from('messages').insert({
        thread_id: activeThreadId,
        role: 'assistant',
        content: text,
        metadata: { model: modelUsed },
      });
      await sb
        .from('threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeThreadId);

      // Background: extract and save memories from this exchange
      extractAndSaveMemories(
        sb,
        dbUser.org_id,
        userText,
        text,
        memoryContext.knowledge
      ).catch((err) => {
        console.error('[chat] Memory extraction failed:', err);
      });
    }
  }).catch((err) => {
    console.error('[chat] Failed to persist assistant response:', err);
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'X-Thread-Id': activeThreadId || '',
    },
  });
}
