import { CronExpressionParser } from 'cron-parser';

export function getNextRunTime(cronExpression: string): Date {
  // CronExpressionParser defaults to UTC (currentDate: new CronDate(undefined, 'UTC'))
  const interval = CronExpressionParser.parse(cronExpression);
  return interval.next().toDate();
}

export function isSubMinuteCron(cronExpression: string): boolean {
  // Cron only supports minute-level granularity.
  // Detect wildcard or step expressions in the minute field that resolve
  // to every-minute runs, which is the absolute minimum.
  // This function exists so the tool can reject requests that clearly
  // expect sub-minute intervals (e.g., "every 30 seconds").
  // A bare "*" or "*/1" in the minute field means every minute — that's allowed.
  // The real guard is in the tool description telling the LLM not to accept
  // sub-minute requests. This catch is a safety net for malformed expressions.
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length > 5) {
    // 6-field cron with a seconds field — not supported
    return true;
  }
  return false;
}

export function isDue(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false;
  return new Date(nextRunAt) <= new Date();
}
