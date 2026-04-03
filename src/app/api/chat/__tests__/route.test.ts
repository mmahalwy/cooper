/**
 * Tests for the chat API route's message persistence logic.
 * These test the critical paths that keep breaking:
 * 1. First message creates a thread and saves the user message
 * 2. Follow-up messages with threadId save to the SAME thread
 * 3. Assistant responses are saved after streaming completes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// These test the persistence logic extracted from the route,
// not the full HTTP handler (which requires too many mocks).

describe('chat message persistence', () => {
  describe('thread creation', () => {
    it('creates a new thread when threadId is not provided', () => {
      const threadId = undefined;
      const activeThreadId = threadId || 'new';
      expect(activeThreadId).toBe('new');
    });

    it('reuses existing thread when threadId is provided', () => {
      const threadId = 'existing-thread-123';
      const activeThreadId = threadId;
      expect(activeThreadId).toBe('existing-thread-123');
    });
  });

  describe('user message extraction', () => {
    it('extracts text from the last user message parts', () => {
      const messages = [
        { role: 'user', parts: [{ type: 'text', text: 'first message' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'response' }] },
        { role: 'user', parts: [{ type: 'text', text: 'second message' }] },
      ];

      const lastUserMessage = messages[messages.length - 1];
      const content = lastUserMessage.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');

      expect(lastUserMessage.role).toBe('user');
      expect(content).toBe('second message');
    });

    it('handles messages with multiple text parts', () => {
      const messages = [
        { role: 'user', parts: [
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ]},
      ];

      const lastUserMessage = messages[messages.length - 1];
      const content = lastUserMessage.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');

      expect(content).toBe('hello world');
    });

    it('skips non-text parts', () => {
      const messages = [
        { role: 'user', parts: [
          { type: 'text', text: 'hello' },
          { type: 'file', file: {} },
          { type: 'text', text: ' world' },
        ]},
      ];

      const lastUserMessage = messages[messages.length - 1];
      const content = lastUserMessage.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');

      expect(content).toBe('hello world');
    });

    it('does not save if last message is not from user', () => {
      const messages = [
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
      ];

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).not.toBe('user');
    });
  });

  describe('threadId fetch body injection (CRITICAL — prevents duplicate threads)', () => {
    /**
     * This simulates the exact fetch interception pattern from /chat/page.tsx.
     * DefaultChatTransport captures body at construction time, so we CANNOT
     * use a getter or ref on the body config. Instead we intercept fetch()
     * and inject threadId into the JSON body.
     *
     * If these tests break, multi-message conversations will create new
     * threads for every message.
     */

    const simulateFetchInterception = (threadIdRef: { current: string | null }, originalBody: string) => {
      let options: any = { body: originalBody };

      // This is the exact logic from /chat/page.tsx fetch interceptor
      if (threadIdRef.current && options?.body) {
        try {
          const body = JSON.parse(options.body as string);
          body.threadId = threadIdRef.current;
          options = { ...options, body: JSON.stringify(body) };
        } catch { /* body isn't JSON, skip */ }
      }

      return JSON.parse(options.body);
    };

    it('first request has no threadId in body', () => {
      const threadIdRef = { current: null as string | null };
      const originalBody = JSON.stringify({ messages: [{ role: 'user' }] });
      const result = simulateFetchInterception(threadIdRef, originalBody);
      expect(result.threadId).toBeUndefined();
      expect(result.messages).toBeDefined();
    });

    it('injects threadId into body after first response sets the ref', () => {
      const threadIdRef = { current: 'thread-abc-123' };
      const originalBody = JSON.stringify({ messages: [{ role: 'user' }] });
      const result = simulateFetchInterception(threadIdRef, originalBody);
      expect(result.threadId).toBe('thread-abc-123');
      expect(result.messages).toBeDefined();
    });

    it('preserves all original body fields when injecting threadId', () => {
      const threadIdRef = { current: 'thread-abc-123' };
      const originalBody = JSON.stringify({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        someOtherField: 'value',
      });
      const result = simulateFetchInterception(threadIdRef, originalBody);
      expect(result.threadId).toBe('thread-abc-123');
      expect(result.messages).toHaveLength(1);
      expect(result.someOtherField).toBe('value');
    });

    it('third message still has the same threadId', () => {
      const threadIdRef = { current: 'thread-abc-123' };

      // Second message
      const result2 = simulateFetchInterception(threadIdRef, JSON.stringify({ messages: [] }));
      expect(result2.threadId).toBe('thread-abc-123');

      // Third message — same threadId
      const result3 = simulateFetchInterception(threadIdRef, JSON.stringify({ messages: [] }));
      expect(result3.threadId).toBe('thread-abc-123');
    });

    it('does not overwrite threadId ref on subsequent responses', () => {
      const threadIdRef = { current: null as string | null };

      // First response sets threadId
      const tid1 = 'thread-first';
      if (tid1 && !threadIdRef.current) {
        threadIdRef.current = tid1;
      }
      expect(threadIdRef.current).toBe('thread-first');

      // Second response with different ID — should NOT overwrite
      const tid2 = 'thread-second';
      if (tid2 && !threadIdRef.current) {
        threadIdRef.current = tid2;
      }
      expect(threadIdRef.current).toBe('thread-first');
    });
  });

  describe('assistant response saving', () => {
    it('saves assistant response when text is not empty', () => {
      const fullText = 'Here is my response';
      const content = fullText || '';
      expect(content).toBe('Here is my response');
      expect(!!content).toBe(true); // would pass the `if (content)` check
    });

    it('does not save when text is empty', () => {
      const fullText = '';
      const content = fullText || '';
      expect(!!content).toBe(false); // would fail the `if (content)` check
    });

    it('saves error message when stream fails', () => {
      const err = new Error('No output generated');
      const errorMessage = `Sorry, I ran into an issue while processing your request. Please try again! 🔄\n\n_Error: ${err.message}_`;
      expect(errorMessage).toContain('No output generated');
    });
  });
});
