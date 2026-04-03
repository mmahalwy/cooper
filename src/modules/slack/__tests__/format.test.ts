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

  it('should convert ~~strikethrough~~ to ~strikethrough~', () => {
    expect(markdownToSlack('This is ~~deleted~~ text')).toBe('This is ~deleted~ text');
  });

  it('should not convert strikethrough inside code blocks', () => {
    expect(markdownToSlack('`~~not struck~~`')).toBe('`~~not struck~~`');
  });

  it('should remove horizontal rule lines (---)', () => {
    expect(markdownToSlack('Above\n---\nBelow')).toBe('Above\n\nBelow');
  });

  it('should remove longer horizontal rules (----)', () => {
    expect(markdownToSlack('Above\n----\nBelow')).toBe('Above\n\nBelow');
  });

  it('should collapse 3+ consecutive newlines to max 2', () => {
    expect(markdownToSlack('A\n\n\nB')).toBe('A\n\nB');
    expect(markdownToSlack('A\n\n\n\n\nB')).toBe('A\n\nB');
  });

  it('should handle combined conversions (strikethrough + bold)', () => {
    expect(markdownToSlack('**bold** and ~~struck~~')).toBe('*bold* and ~struck~');
  });
});
