import type { WebClient } from '@slack/web-api';
import type { KnownBlock, SectionBlock, DividerBlock } from '@slack/types';

const MAX_BLOCKS = 50;
const MAX_SECTION_TEXT = 3000; // Slack limit per section text

// Thresholds for deciding whether to use Block Kit
const PLAIN_TEXT_MAX_LENGTH = 200;

/**
 * Detect whether text has structural elements that benefit from Block Kit:
 * - Headers (*bold* lines that represent titles)
 * - Bullet lists
 * - Numbered lists
 * - Code blocks
 * - Multiple paragraphs (long content)
 */
export function isStructured(text: string): boolean {
  if (text.length >= PLAIN_TEXT_MAX_LENGTH) return true;

  // Bullet lists
  if (/^[*\-•]\s+\S/m.test(text)) return true;

  // Numbered lists
  if (/^\d+\.\s+\S/m.test(text)) return true;

  // Header-like bold lines (*Title*)
  if (/^\*[^*\n]+\*\s*$/m.test(text)) return true;

  // Code blocks
  if (/```/.test(text)) return true;

  return false;
}

/**
 * Truncate text to Slack's section limit, appending an ellipsis if needed.
 */
function truncateText(text: string, max = MAX_SECTION_TEXT): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/**
 * Build a mrkdwn SectionBlock.
 */
function section(text: string): SectionBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: truncateText(text),
    },
  };
}

/**
 * Build a DividerBlock.
 */
function divider(): DividerBlock {
  return { type: 'divider' };
}

/**
 * Convert a mrkdwn-formatted text string into an array of Slack Block Kit blocks.
 *
 * Rules:
 * - Triple-backtick code blocks → single SectionBlock (preserves formatting)
 * - Lines starting with `*Header Text*` alone → SectionBlock with bold text +
 *   a divider below (acts as a visual header)
 * - Bullet / numbered list paragraphs → single SectionBlock (mrkdwn handles rendering)
 * - Normal paragraphs → SectionBlock
 * - Maximum 50 blocks; extra content is dropped with a trailing notice
 */
export function textToBlocks(text: string): KnownBlock[] {
  if (!text) return [];

  const blocks: KnownBlock[] = [];

  // Split on code fences first to protect their contents
  const segments = text.split(/(```[\s\S]*?```)/g);

  for (const segment of segments) {
    if (blocks.length >= MAX_BLOCKS - 2) {
      // Leave room for a truncation notice
      blocks.push(section('_… (content truncated due to message length)_'));
      break;
    }

    if (segment.startsWith('```') && segment.endsWith('```')) {
      // Code block — emit as-is
      if (segment.trim()) {
        blocks.push(section(segment.trim()));
      }
      continue;
    }

    // Split remaining segment into paragraphs (separated by blank lines)
    const paragraphs = segment.split(/\n{2,}/);

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (blocks.length >= MAX_BLOCKS - 2) {
        blocks.push(section('_… (content truncated due to message length)_'));
        break;
      }

      // Detect a header-only line: *Some Title* with optional whitespace
      const isHeader = /^\*[^*\n]+\*\s*$/.test(trimmed);

      if (isHeader) {
        // Add divider before non-first headers for visual separation
        if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'divider') {
          blocks.push(divider());
        }
        blocks.push(section(trimmed));
      } else {
        blocks.push(section(trimmed));
      }
    }
  }

  return blocks.slice(0, MAX_BLOCKS);
}

/**
 * Post a message to Slack using Block Kit when the text is structured,
 * or fall back to plain text for short, simple replies.
 *
 * @param client      Initialized WebClient
 * @param channel     Slack channel ID
 * @param thread_ts   Thread timestamp to reply into (undefined for new threads)
 * @param text        Already-converted Slack mrkdwn text
 */
export async function postWithBlocks(
  client: WebClient,
  channel: string,
  thread_ts: string | undefined,
  text: string
): Promise<void> {
  if (!isStructured(text)) {
    // Simple reply — plain text is faster and less noisy
    await client.chat.postMessage({
      channel,
      thread_ts,
      text,
      unfurl_links: false,
    });
    return;
  }

  // Long / structured response — use Block Kit
  const blocks = textToBlocks(text);

  if (blocks.length === 0) {
    // Fallback — should never happen, but be safe
    await client.chat.postMessage({
      channel,
      thread_ts,
      text,
      unfurl_links: false,
    });
    return;
  }

  await client.chat.postMessage({
    channel,
    thread_ts,
    // `text` is the fallback for notifications / accessibility
    text,
    blocks,
    unfurl_links: false,
  });
}
