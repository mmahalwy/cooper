import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const scheduleSchema = z.object({
  name: z.string().describe('Short name for the scheduled task'),
  cron: z.string().describe('Cron expression (5 fields: minute hour day-of-month month day-of-week). Use UTC time.'),
  prompt: z.string().describe('The prompt to send to the AI agent when this task runs'),
  humanReadable: z.string().describe('Human-readable description of when this runs, e.g., "Every Monday at 9:00 AM UTC"'),
});

export type ParsedSchedule = z.infer<typeof scheduleSchema>;

export async function parseScheduleFromNL(
  userDescription: string
): Promise<ParsedSchedule> {
  const result = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: scheduleSchema,
    prompt: `Parse the following natural language description into a scheduled task definition.
The current date/time is ${new Date().toISOString()}.

User's description:
"${userDescription}"

Generate:
1. A short name for the task
2. A valid cron expression (5 fields, UTC timezone). IMPORTANT: The minimum interval is 1 minute — cron does not support sub-minute (e.g., "every 30 seconds") schedules. Use "* * * * *" for the most frequent option (every minute).
3. The prompt that should be sent to the AI agent each time the task runs
4. A human-readable description of the schedule

Examples of cron expressions:
- "* * * * *" = Every minute (minimum interval)
- "0 9 * * 1" = Every Monday at 9:00 AM UTC
- "0 14 * * *" = Every day at 2:00 PM UTC
- "30 8 * * 1-5" = Weekdays at 8:30 AM UTC
- "0 0 1 * *" = First day of every month at midnight UTC`,
  });

  return result.object;
}
