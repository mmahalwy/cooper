import { describe, it, expect } from 'vitest';
import { convertSlackHistoryToMessages } from '../threads';

describe('convertSlackHistoryToMessages', () => {
  const botUserId = 'U_BOT';

  it('should convert bot messages to assistant role', () => {
    const messages = [
      { user: 'U_BOT', text: 'Hello!', ts: '1.0', bot_id: 'B123' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'assistant', content: 'Hello!' }]);
  });

  it('should convert user messages to user role', () => {
    const messages = [
      { user: 'U_USER', text: 'Hey Cooper', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'user', content: 'Hey Cooper' }]);
  });

  it('should strip bot mentions from text', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT> what is the weather?', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'user', content: 'what is the weather?' }]);
  });

  it('should handle mixed thread history in order', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT> hello', ts: '1.0' },
      { user: 'U_BOT', text: 'Hi there!', ts: '2.0', bot_id: 'B123' },
      { user: 'U_USER', text: 'thanks', ts: '3.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'thanks' },
    ]);
  });

  it('should skip messages with empty text after stripping', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT>', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([]);
  });
});
