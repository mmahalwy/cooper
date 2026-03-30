'use client';

import { useEffect, useState } from 'react';
import { Stack, Button, Text, NavLink } from '@mantine/core';
import { IconPlus, IconMessage } from '@tabler/icons-react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Thread } from '@/lib/types';

export function ChatSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function loadThreads() {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (data) setThreads(data);
    }

    loadThreads();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('threads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threads' },
        () => loadThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Stack h="100%" gap="sm">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        fullWidth
        onClick={() => router.push('/chat')}
      >
        New chat
      </Button>

      <Stack gap={4} mt="md" style={{ flex: 1, overflow: 'auto' }}>
        {threads.length === 0 && (
          <Text size="xs" c="dimmed">
            No conversations yet
          </Text>
        )}
        {threads.map((thread) => (
          <NavLink
            key={thread.id}
            label={thread.title || 'Untitled'}
            leftSection={<IconMessage size={16} />}
            active={params?.threadId === thread.id}
            onClick={() => router.push(`/chat/${thread.id}`)}
            style={{ borderRadius: 'var(--mantine-radius-md)' }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
