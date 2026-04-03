import type { UIMessage } from 'ai';
import type { ChatMessage } from '@/lib/chat-types';
import type { Message } from '@/lib/types';

type PersistedMessageMetadata = Record<string, unknown> & {
  parts?: ChatMessage['parts'];
};

function isPersistedMetadata(value: unknown): value is PersistedMessageMetadata {
  return typeof value === 'object' && value !== null;
}

function getPersistedParts(message: Message): ChatMessage['parts'] | null {
  if (!isPersistedMetadata(message.metadata) || !Array.isArray(message.metadata.parts)) {
    return null;
  }

  return message.metadata.parts as ChatMessage['parts'];
}

export function messageToChatMessage(message: Message): ChatMessage {
  const persistedParts = getPersistedParts(message);

  return {
    id: message.id,
    role: message.role as UIMessage['role'],
    parts: persistedParts ?? [{ type: 'text', text: message.content }],
  };
}
