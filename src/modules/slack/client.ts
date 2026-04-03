import { WebClient } from '@slack/web-api';

const clientCache = new Map<string, WebClient>();

export function getSlackClient(botToken: string): WebClient {
  let client = clientCache.get(botToken);
  if (!client) {
    client = new WebClient(botToken);
    clientCache.set(botToken, client);
  }
  return client;
}
