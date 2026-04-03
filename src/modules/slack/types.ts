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
export type SlackEvent = AppMentionEvent | MessageImEvent | ReactionAddedEvent | AppHomeOpenedEvent;

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

export interface AppHomeOpenedEvent {
  type: 'app_home_opened';
  user: string;
  channel: string;
  tab: 'home' | 'messages';
  view?: { id: string; type: string };
  event_ts: string;
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
