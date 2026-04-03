import crypto from 'crypto';

const MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  rawBody: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('[slack] SLACK_SIGNING_SECRET is not set');
    return false;
  }

  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > MAX_AGE_SECONDS) {
    console.warn('[slack] Request timestamp too old:', timestamp);
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
