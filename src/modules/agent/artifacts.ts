/**
 * Artifact system — lets Cooper produce rich, structured outputs
 * (code blocks, tables, HTML previews, terminal output, file downloads)
 * that render as prominent cards in the chat.
 */

import { tool } from 'ai';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Artifact {
  id: string;
  type: 'code' | 'table' | 'html' | 'terminal' | 'file';
  title: string;
  content: string;
  language?: string;   // for code artifacts
  filename?: string;   // for file artifacts
  metadata?: Record<string, unknown>;
}

// Type-guard used by the renderer to detect artifact tool results
export function isArtifactResult(value: unknown): value is Artifact & { artifact: true } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.artifact === true && typeof obj.type === 'string' && typeof obj.content === 'string';
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export function createArtifactTools() {
  return {
    create_artifact: tool({
      description: `Create a rich artifact to display to the user. Use this for:
- Code that should be displayed in a dedicated panel (not inline)
- Data tables with structured data (provide an HTML table string)
- HTML/CSS previews
- Terminal output from code execution
- Generated files the user can download

Artifacts are displayed prominently in the chat with proper formatting, syntax highlighting, and action buttons.`,
      inputSchema: z.object({
        type: z.enum(['code', 'table', 'html', 'terminal', 'file']),
        title: z.string().describe('Short descriptive title shown in the artifact header'),
        content: z.string().describe('The artifact body — source code, HTML table markup, terminal output, etc.'),
        language: z.string().optional().describe('Programming language for syntax highlighting (code artifacts)'),
        filename: z.string().optional().describe('Suggested filename for file artifacts'),
      }),
      execute: async ({ type, title, content, language, filename }) => {
        return {
          artifact: true as const,
          id: crypto.randomUUID(),
          type,
          title,
          content,
          language,
          filename,
        };
      },
    }),
  };
}
