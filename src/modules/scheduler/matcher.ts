import { CronExpressionParser } from 'cron-parser';

export function getNextRunTime(cronExpression: string): Date {
  // CronExpressionParser defaults to UTC (currentDate: new CronDate(undefined, 'UTC'))
  const interval = CronExpressionParser.parse(cronExpression);
  return interval.next().toDate();
}

export function isDue(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false;
  return new Date(nextRunAt) <= new Date();
}
