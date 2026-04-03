import { describe, it, expect } from 'vitest';
import { markdownToSlack } from '../format';

describe('markdownToSlack', () => {
  it('should convert **bold** to *bold*', () => {
    expect(markdownToSlack('This is **bold** text')).toBe('This is *bold* text');
  });

  it('should convert [text](url) to <url|text>', () => {
    expect(markdownToSlack('Click [here](https://example.com) now')).toBe(
      'Click <https://example.com|here> now'
    );
  });

  it('should not convert bold inside code blocks', () => {
    expect(markdownToSlack('`**not bold**`')).toBe('`**not bold**`');
  });

  it('should preserve triple-backtick code blocks', () => {
    const input = '```\nconst x = 1;\n```';
    expect(markdownToSlack(input)).toBe(input);
  });

  it('should handle multiple conversions in one string', () => {
    const input = '**Hello** and [link](https://x.com)';
    expect(markdownToSlack(input)).toBe('*Hello* and <https://x.com|link>');
  });

  it('should convert markdown headers to bold text', () => {
    expect(markdownToSlack('## Section Title')).toBe('*Section Title*');
    expect(markdownToSlack('### Subsection')).toBe('*Subsection*');
  });

  it('should return empty string for empty input', () => {
    expect(markdownToSlack('')).toBe('');
  });
});
