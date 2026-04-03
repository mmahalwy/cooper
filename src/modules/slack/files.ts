import type { WebClient } from '@slack/web-api';
import type { SlackFile } from './types';

const MAX_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_FILE_BYTES = 1 * 1024 * 1024; // 1MB — cap inline text content

interface FileToUpload {
  filename: string;
  content: Buffer | string;
  mimeType?: string;
}

export type { FileToUpload };

export async function uploadFilesToSlack(
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  files: FileToUpload[]
): Promise<void> {
  for (const file of files) {
    const size = typeof file.content === 'string'
      ? Buffer.byteLength(file.content)
      : file.content.length;

    if (size > MAX_DIRECT_UPLOAD_BYTES) {
      console.warn(`[slack] File ${file.filename} too large (${size} bytes), skipping upload`);
      continue;
    }

    try {
      await slackClient.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: file.filename,
        file: typeof file.content === 'string' ? Buffer.from(file.content) : file.content,
      });
    } catch (err) {
      console.error(`[slack] Failed to upload file ${file.filename}:`, err);
    }
  }
}

/**
 * Download a Slack private file using the bot token.
 * Slack private URLs require an Authorization header — unauthenticated GETs 403.
 */
export async function downloadSlackFile(url: string, botToken: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Slack file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Given a list of Slack files attached to a DM, download each and build a
 * context string that can be prepended to the user's message before the AI call.
 *
 * - text / CSV / JSON / markdown  → inline content
 * - images                        → data URL (base64) so vision models can see it
 * - PDFs                          → best-effort text extraction via pdfjs-dist;
 *                                   falls back to a filename mention
 * - everything else               → filename mention only
 */
export async function buildFileContext(
  files: SlackFile[],
  botToken: string
): Promise<string> {
  const parts: string[] = [];

  for (const file of files) {
    try {
      const buffer = await downloadSlackFile(
        file.url_private_download || file.url_private,
        botToken
      );

      // ── Text-like files ──────────────────────────────────────────────────
      const isText =
        file.mimetype.startsWith('text/') ||
        file.mimetype === 'application/json' ||
        file.mimetype === 'application/csv' ||
        /\.(txt|csv|json|md|mdx|log|yaml|yml|toml|xml|html|htm|css|js|ts|tsx|jsx|sh|py|rb|java|go|rs|php|sql)$/i.test(
          file.name
        );

      if (isText) {
        const content = buffer.slice(0, MAX_TEXT_FILE_BYTES).toString('utf-8');
        const truncated = buffer.length > MAX_TEXT_FILE_BYTES ? '\n[...truncated]' : '';
        parts.push(`[File: ${file.name}]\n${content}${truncated}`);
        continue;
      }

      // ── Images ────────────────────────────────────────────────────────────
      if (file.mimetype.startsWith('image/')) {
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64}`;
        parts.push(`[Image: ${file.name}]\n${dataUrl}`);
        continue;
      }

      // ── PDFs ──────────────────────────────────────────────────────────────
      if (file.mimetype === 'application/pdf') {
        try {
          // Dynamic import — pdfjs-dist may not be installed in all environments
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
          const pdfDoc = await loadingTask.promise;
          const textParts: string[] = [];

          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = (textContent.items as Array<{ str?: string }>)
              .map((item) => item.str ?? '')
              .join(' ');
            textParts.push(pageText);
          }

          const fullText = textParts.join('\n').trim();
          if (fullText) {
            parts.push(`[PDF: ${file.name}]\n${fullText}`);
            continue;
          }
        } catch {
          // pdfjs not available or parse failed — fall through to filename-only
        }
        parts.push(`[PDF attached: ${file.name}]`);
        continue;
      }

      // ── Everything else ───────────────────────────────────────────────────
      parts.push(`[File attached: ${file.name} (${file.mimetype})]`);
    } catch (err) {
      console.error(`[slack] Failed to process attached file ${file.name}:`, err);
      parts.push(`[File attached: ${file.name} — could not be read]`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Scan agent tool call results for file artifacts.
 * Returns files that should be uploaded to Slack.
 */
export function extractFileArtifacts(
  steps: Array<{ toolResults?: Array<Record<string, any>> }>
): FileToUpload[] {
  const files: FileToUpload[] = [];

  for (const step of steps) {
    if (!step.toolResults) continue;
    for (const tr of step.toolResults) {
      const result = (tr as any).result;
      if (!result || typeof result !== 'object') continue;

      if (result.artifacts && Array.isArray(result.artifacts)) {
        for (const artifact of result.artifacts) {
          if (artifact.type === 'image' && artifact.base64) {
            files.push({
              filename: artifact.filename || 'output.png',
              content: Buffer.from(artifact.base64, 'base64'),
              mimeType: 'image/png',
            });
          }
          if (artifact.type === 'file' && artifact.content) {
            files.push({
              filename: artifact.filename || 'output.txt',
              content: artifact.content,
            });
          }
        }
      }
    }
  }

  return files;
}
