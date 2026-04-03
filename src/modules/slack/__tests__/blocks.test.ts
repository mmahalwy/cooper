import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isStructured, textToBlocks, postWithBlocks } from '../blocks';
import type { WebClient } from '@slack/web-api';

// ---------------------------------------------------------------------------
// isStructured
// ---------------------------------------------------------------------------

describe('isStructured', () => {
  it('returns false for short plain text', () => {
    expect(isStructured('Sure, happy to help!')).toBe(false);
    expect(isStructured('Done!')).toBe(false);
  });

  it('returns true for text >= 200 chars', () => {
    const longText = 'a'.repeat(200);
    expect(isStructured(longText)).toBe(true);
  });

  it('returns true when text contains bullet lists (- or *)', () => {
    expect(isStructured('- item one\n- item two')).toBe(true);
    expect(isStructured('* item one\n* item two')).toBe(true);
  });

  it('returns true when text contains numbered lists', () => {
    expect(isStructured('1. First\n2. Second')).toBe(true);
  });

  it('returns true when text contains a header-like bold line', () => {
    expect(isStructured('*Section Title*\nSome content')).toBe(true);
  });

  it('returns true when text contains a code block', () => {
    expect(isStructured('Here is code:\n```\nconst x = 1;\n```')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// textToBlocks
// ---------------------------------------------------------------------------

describe('textToBlocks', () => {
  it('returns empty array for empty string', () => {
    expect(textToBlocks('')).toEqual([]);
  });

  it('converts a plain paragraph to a single section block', () => {
    const blocks = textToBlocks('Hello, this is a message.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('section');
    expect((blocks[0] as any).text.text).toBe('Hello, this is a message.');
  });

  it('splits multiple paragraphs into multiple section blocks', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const blocks = textToBlocks(text);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as any).text.text).toBe('First paragraph.');
    expect((blocks[1] as any).text.text).toBe('Second paragraph.');
  });

  it('preserves code blocks as mrkdwn section blocks', () => {
    const text = 'Look at this:\n\n```\nconst x = 1;\n```';
    const blocks = textToBlocks(text);
    const codeBlock = blocks.find(
      (b) => b.type === 'section' && (b as any).text.text.startsWith('```')
    );
    expect(codeBlock).toBeDefined();
    expect((codeBlock as any).text.text).toContain('const x = 1;');
  });

  it('adds a divider before a header that follows content', () => {
    const text = 'Some intro.\n\n*Section Title*\n\nContent here.';
    const blocks = textToBlocks(text);
    // Should be: section("Some intro."), divider, section("*Section Title*"), section("Content here.")
    const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
    expect(dividerIdx).toBeGreaterThan(0);
    expect(blocks[dividerIdx + 1].type).toBe('section');
    expect((blocks[dividerIdx + 1] as any).text.text).toBe('*Section Title*');
  });

  it('does NOT add a divider before a header that is the first block', () => {
    const text = '*Section Title*\n\nContent here.';
    const blocks = textToBlocks(text);
    expect(blocks[0].type).toBe('section');
    expect((blocks[0] as any).text.text).toBe('*Section Title*');
    // No leading divider
    const hasDivider = blocks.some((b) => b.type === 'divider');
    expect(hasDivider).toBe(false);
  });

  it('truncates text longer than 3000 chars in a section', () => {
    const longPara = 'x'.repeat(4000);
    const blocks = textToBlocks(longPara);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as any).text.text.length).toBeLessThanOrEqual(3000);
    expect((blocks[0] as any).text.text.endsWith('…')).toBe(true);
  });

  it('caps total blocks at 50', () => {
    // Generate many paragraphs
    const paragraphs = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}.`);
    const text = paragraphs.join('\n\n');
    const blocks = textToBlocks(text);
    expect(blocks.length).toBeLessThanOrEqual(50);
  });

  it('handles bullet lists as a single section block', () => {
    const text = '- Item A\n- Item B\n- Item C';
    const blocks = textToBlocks(text);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as any).text.text).toContain('- Item A');
  });
});

// ---------------------------------------------------------------------------
// postWithBlocks
// ---------------------------------------------------------------------------

describe('postWithBlocks', () => {
  let mockClient: { chat: { postMessage: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    mockClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
    };
  });

  it('uses plain text for short unstructured messages', async () => {
    await postWithBlocks(
      mockClient as unknown as WebClient,
      'C123',
      '1234567890.123',
      'Sure, I can help!'
    );

    expect(mockClient.chat.postMessage).toHaveBeenCalledOnce();
    const call = mockClient.chat.postMessage.mock.calls[0][0];
    expect(call.blocks).toBeUndefined();
    expect(call.text).toBe('Sure, I can help!');
  });

  it('uses blocks for long / structured messages', async () => {
    const structured =
      '*Summary*\n\nHere is a breakdown:\n\n- Point one\n- Point two\n- Point three\n\n*Details*\n\nMore details follow here with a lengthy explanation.';

    await postWithBlocks(
      mockClient as unknown as WebClient,
      'C123',
      '1234567890.123',
      structured
    );

    expect(mockClient.chat.postMessage).toHaveBeenCalledOnce();
    const call = mockClient.chat.postMessage.mock.calls[0][0];
    expect(Array.isArray(call.blocks)).toBe(true);
    expect(call.blocks!.length).toBeGreaterThan(0);
    // Fallback text should still be set
    expect(call.text).toBe(structured);
  });

  it('passes thread_ts correctly', async () => {
    await postWithBlocks(
      mockClient as unknown as WebClient,
      'C456',
      '9999999999.000',
      'Quick reply'
    );

    const call = mockClient.chat.postMessage.mock.calls[0][0];
    expect(call.channel).toBe('C456');
    expect(call.thread_ts).toBe('9999999999.000');
  });

  it('passes undefined thread_ts for top-level messages', async () => {
    await postWithBlocks(
      mockClient as unknown as WebClient,
      'C789',
      undefined,
      'Top-level message'
    );

    const call = mockClient.chat.postMessage.mock.calls[0][0];
    expect(call.thread_ts).toBeUndefined();
  });
});
