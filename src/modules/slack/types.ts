// Slack event envelope
export interface SlackEventEnvelope {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  token?: string;
  team_id: string;
  event_id?: string;
  event_time?: number;
  event: SlackEvent;
}

// Union of events we handle
export type SlackEvent =
  | AppMentionEvent
  | MessageImEvent
  | MessageChannelEvent
  | ReactionAddedEvent
  | MessageChangedEvent;

export interface AppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  team?: string;
  bot_id?: string;
  bot_profile?: unknown;
}

export interface ReactionAddedEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item: {
    type: 'message';
    channel: string;
    ts: string;
  };
  item_user: string;
  event_ts: string;
}

export interface MessageChangedEvent {
  type: 'message';
  subtype: 'message_changed';
  channel: string;
  ts: string;
  message: {
    type: 'message';
    text: string;
    user: string;
    ts: string;
    bot_id?: string;
    edited?: { user: string; ts: string };
  };
  previous_message: {
    type: 'message';
    text: string;
    user: string;
    ts: string;
  };
  channel_type: 'im' | 'channel' | 'group';
  event_ts: string;
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  url_private_download: string;
  size: number;
}

export interface MessageImEvent {
  type: 'message';
  channel_type: 'im';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  team?: string;
  subtype?: string;
  bot_id?: string;
  bot_profile?: unknown;
  files?: SlackFile[];
}

/**
 * A plain (non-DM) channel message — used for opt-in channel monitoring.
 * channel_type will be 'channel', 'group', or 'mpim' (never 'im').
 */
export interface MessageChannelEvent {
  type: 'message';
  channel_type: 'channel' | 'group' | 'mpim';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  team?: string;
  subtype?: string;
  bot_id?: string;
  bot_profile?: unknown;
}

// DB row types
export interface SlackInstallation {
  id: string;
  team_id: string;
  org_id: string;
  bot_token: string;
  bot_user_id: string;
  installed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackUserMapping {
  id: string;
  slack_user_id: string;
  slack_team_id: string;
  user_id: string;
  org_id: string;
  created_at: string;
}

export interface SlackThreadMapping {
  id: string;
  slack_channel_id: string;
  slack_thread_ts: string;
  thread_id: string;
  org_id: string;
  created_at: string;
}
