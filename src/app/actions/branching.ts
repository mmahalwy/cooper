'use server';

import { getAuthContext } from './helpers';

export async function branchThreadAction(threadId: string, afterMessageId: string) {
  const { supabase, user, orgId } = await getAuthContext();

  // Get original thread
  const { data: thread } = await supabase
    .from('threads')
    .select('title')
    .eq('id', threadId)
    .single();

  if (!thread) return { error: 'Thread not found' };

  // Get the branching message to know the cutoff
  const { data: branchMessage } = await supabase
    .from('messages')
    .select('created_at')
    .eq('id', afterMessageId)
    .single();

  if (!branchMessage) return { error: 'Message not found' };

  // Create new thread
  const { data: newThread, error: createError } = await supabase
    .from('threads')
    .insert({
      org_id: orgId,
      user_id: user.id,
      title: `${thread.title || 'Conversation'} (branch)`,
      parent_thread_id: threadId,
      branched_at_message_id: afterMessageId,
    })
    .select('id')
    .single();

  if (createError || !newThread) return { error: 'Failed to create branch' };

  // Copy messages up to and including the branch point
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, tool_calls, metadata')
    .eq('thread_id', threadId)
    .lte('created_at', branchMessage.created_at)
    .order('created_at');

  if (messages && messages.length > 0) {
    const copies = messages.map((m) => ({
      thread_id: newThread.id,
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      metadata: m.metadata,
    }));

    await supabase.from('messages').insert(copies);
  }

  return { threadId: newThread.id };
}
