import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

function signRequest(signingSecret: string, timestamp: string, body: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('verifySlackRequest', () => {
  const SIGNING_SECRET = 'test-signing-secret-1234';

  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', SIGNING_SECRET);
  });

  it('should accept a valid signature', async () => {
    const { verifySlackRequest } = await import('../verify');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"event_callback"}';
    const signature = signRequest(SIGNING_SECRET, timestamp, body);

    const result = verifySlackRequest(signature, timestamp, body);
    expect(result).toBe(true);
  });

  it('should reject an invalid signature', async () => {
    const { verifySlackRequest } = await import('../verify');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"event_callback"}';

    const result = verifySlackRequest('v0=invalidsignature', timestamp, body);
    expect(result).toBe(false);
  });

  it('should reject a request older than 5 minutes', async () => {
    const { verifySlackRequest } = await import('../verify');
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const body = '{"type":"event_callback"}';
    const signature = signRequest(SIGNING_SECRET, oldTimestamp, body);

    const result = verifySlackRequest(signature, oldTimestamp, body);
    expect(result).toBe(false);
  });
});
