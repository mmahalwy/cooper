export function markdownToSlack(text: string): string {
  if (!text) return '';

  // Split on code blocks to avoid converting inside them
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts
    .map((part, i) => {
      // Odd indices are code blocks — leave them alone
      if (i % 2 === 1) return part;

      return part
        // Headers -> bold (## Title -> *Title*)
        .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
        // Bold **text** -> *text*
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        // Links [text](url) -> <url|text>
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
        // Strikethrough ~~text~~ -> ~text~
        .replace(/~~(.+?)~~/g, '~$1~')
        // Remove horizontal rules
        .replace(/^-{3,}$/gm, '')
        // Collapse 3+ consecutive newlines to max 2
        .replace(/\n{3,}/g, '\n\n');
    })
    .join('');
}
