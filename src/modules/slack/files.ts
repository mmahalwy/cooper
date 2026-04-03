import type { WebClient } from '@slack/web-api';

const MAX_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

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
