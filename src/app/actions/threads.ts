'use server';

import { getAuthContext } from './helpers';

export async function searchThreadsAction(query: string) {
  const { supabase, orgId } = await getAuthContext();

  if (!query.trim()) return [];

  // Search threads by title
  const { data: titleMatches } = await supabase
    .from('threads')
    .select('id, title, updated_at')
    .eq('org_id', orgId)
    .is('scheduled_task_id', null)
    .ilike('title', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(10);

  // Search messages by content
  const { data: messageMatches } = await supabase
    .from('messages')
    .select('thread_id, content')
    .in('thread_id', (await supabase.from('threads').select('id').eq('org_id', orgId).is('scheduled_task_id', null)).data?.map(t => t.id) || [])
    .ilike('content', `%${query}%`)
    .limit(20);

  // Merge results, dedupe by thread_id
  const seen = new Set<string>();
  const results: Array<{ id: string; title: string; snippet?: string }> = [];

  for (const t of titleMatches || []) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      results.push({ id: t.id, title: t.title || 'Untitled' });
    }
  }

  if (messageMatches) {
    const threadIds = [...new Set(messageMatches.map(m => m.thread_id).filter(id => !seen.has(id)))];
    if (threadIds.length > 0) {
      const { data: threads } = await supabase
        .from('threads')
        .select('id, title')
        .in('id', threadIds);

      for (const thread of threads || []) {
        if (!seen.has(thread.id)) {
          seen.add(thread.id);
          const msg = messageMatches.find(m => m.thread_id === thread.id);
          const snippet = msg?.content.slice(0, 80) || undefined;
          results.push({ id: thread.id, title: thread.title || 'Untitled', snippet });
        }
      }
    }
  }

  return results.slice(0, 15);
}
