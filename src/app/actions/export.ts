'use server';

import { getAuthContext } from './helpers';

export async function exportThreadAction(threadId: string, format: 'markdown' | 'json' = 'markdown') {
  const { supabase } = await getAuthContext();

  const [{ data: thread }, { data: messages }] = await Promise.all([
    supabase.from('threads').select('title, created_at').eq('id', threadId).single(),
    supabase.from('messages').select('role, content, created_at').eq('thread_id', threadId).order('created_at'),
  ]);

  if (!thread || !messages) return { error: 'Thread not found' };

  if (format === 'json') {
    return {
      content: JSON.stringify({ thread, messages }, null, 2),
      filename: `${thread.title || 'conversation'}.json`,
      mimeType: 'application/json',
    };
  }

  // Markdown format
  let md = `# ${thread.title || 'Conversation'}\n`;
  md += `*Exported from Cooper on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

  for (const msg of messages) {
    const role = msg.role === 'user' ? '**You**' : msg.role === 'assistant' ? '**Cooper**' : '**System**';
    const time = new Date(msg.created_at).toLocaleTimeString();
    md += `### ${role} — ${time}\n\n${msg.content}\n\n---\n\n`;
  }

  return {
    content: md,
    filename: `${(thread.title || 'conversation').replace(/[^a-z0-9]/gi, '-')}.md`,
    mimeType: 'text/markdown',
  };
}
