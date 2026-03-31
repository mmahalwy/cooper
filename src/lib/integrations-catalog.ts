export interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  popular?: boolean;
  composioApp: string; // The app name to pass to Composio
  toolCount: number;
}

export const CATEGORIES = [
  'All',
  'Analytics',
  'CRM',
  'Communication',
  'Development',
  'Project Management',
  'Marketing',
  'Finance',
  'HR',
  'Productivity',
] as const;

export const INTEGRATIONS: Integration[] = [
  { id: 'linear', name: 'Linear', description: 'Create and manage issues, projects, and workflows', category: 'Project Management', popular: true, composioApp: 'linear', toolCount: 42 },
  { id: 'github', name: 'GitHub', description: 'Clone repos, run git commands, and manage PRs', category: 'Development', popular: true, composioApp: 'github', toolCount: 35 },
  { id: 'slack', name: 'Slack', description: 'Send messages, manage channels, and automate workflows', category: 'Communication', popular: true, composioApp: 'slack', toolCount: 28 },
  { id: 'notion', name: 'Notion', description: 'Create and manage pages, databases, and wikis', category: 'Productivity', popular: true, composioApp: 'notion', toolCount: 24 },
  { id: 'posthog', name: 'PostHog', description: 'Product analytics and feature flags', category: 'Analytics', popular: true, composioApp: 'posthog', toolCount: 72 },
  { id: 'sentry', name: 'Sentry', description: 'Error tracking and performance monitoring', category: 'Development', composioApp: 'sentry', toolCount: 21 },
  { id: 'google-drive', name: 'Google Drive', description: 'Access Google Drive files, Sheets, and Docs', category: 'Productivity', composioApp: 'googledrive', toolCount: 20 },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM, marketing automation, and sales tools', category: 'CRM', popular: true, composioApp: 'hubspot', toolCount: 45 },
  { id: 'stripe', name: 'Stripe', description: 'Payment processing and subscription management', category: 'Finance', composioApp: 'stripe', toolCount: 30 },
  { id: 'jira', name: 'Jira', description: 'Issue tracking and agile project management', category: 'Project Management', composioApp: 'jira', toolCount: 38 },
  { id: 'salesforce', name: 'Salesforce', description: 'CRM and customer relationship management', category: 'CRM', composioApp: 'salesforce', toolCount: 50 },
  { id: 'gmail', name: 'Gmail', description: 'Send, read, and manage emails', category: 'Communication', composioApp: 'gmail', toolCount: 15 },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Manage events, meetings, and schedules', category: 'Productivity', composioApp: 'googlecalendar', toolCount: 12 },
  { id: 'asana', name: 'Asana', description: 'Task and project management', category: 'Project Management', composioApp: 'asana', toolCount: 25 },
  { id: 'figma', name: 'Figma', description: 'Design collaboration and prototyping', category: 'Development', composioApp: 'figma', toolCount: 10 },
  { id: 'intercom', name: 'Intercom', description: 'Customer messaging and support', category: 'Communication', composioApp: 'intercom', toolCount: 18 },
  { id: 'datadog', name: 'Datadog', description: 'Infrastructure monitoring and APM', category: 'Analytics', composioApp: 'datadog', toolCount: 22 },
  { id: 'twilio', name: 'Twilio', description: 'SMS, voice, and messaging APIs', category: 'Communication', composioApp: 'twilio', toolCount: 14 },
  { id: 'zendesk', name: 'Zendesk', description: 'Customer service and support platform', category: 'CRM', composioApp: 'zendesk', toolCount: 20 },
  { id: 'airtable', name: 'Airtable', description: 'Spreadsheet-database hybrid for teams', category: 'Productivity', composioApp: 'airtable', toolCount: 16 },
  { id: 'granola', name: 'Granola', description: 'AI meeting notes — automatic transcription, summaries, and action items', category: 'Productivity', composioApp: 'granola_mcp', toolCount: 10 },
];
