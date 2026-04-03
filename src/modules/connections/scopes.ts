/**
 * Default scope for each app type.
 * Personal apps (calendar, email, drive) default to personal.
 * Team tools (analytics, project management) default to shared.
 */

const PERSONAL_BY_DEFAULT = new Set([
  'gmail', 'googlecalendar', 'googledrive',
  'outlook', 'outlook_calendar', 'onedrive',
  'dropbox', 'notion', 'todoist', 'trello',
]);

export function getDefaultScope(appName: string): 'personal' | 'shared' {
  return PERSONAL_BY_DEFAULT.has(appName.toLowerCase()) ? 'personal' : 'shared';
}
