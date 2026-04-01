import { describe, it, expect } from 'vitest';
import { getNextRunTime, isSubMinuteCron, isDue } from './matcher';

describe('getNextRunTime', () => {
  it('returns a Date instance for a standard 5-field cron expression', () => {
    const result = getNextRunTime('* * * * *');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns a future date for every-minute cron', () => {
    const before = new Date();
    const result = getNextRunTime('* * * * *');
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });

  it('returns a future date for a specific hour/minute expression', () => {
    const before = new Date();
    // Run at midnight every day — next occurrence is always in the future
    // (or right now, but at minimum >= now)
    const result = getNextRunTime('0 0 * * *');
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('returns a future date for every 5 minutes', () => {
    const before = new Date();
    const result = getNextRunTime('*/5 * * * *');
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });

  it('throws for an invalid cron expression', () => {
    expect(() => getNextRunTime('not a cron')).toThrow();
  });
});

describe('isSubMinuteCron', () => {
  it('returns true for a 6-field cron expression (with seconds field)', () => {
    expect(isSubMinuteCron('*/30 * * * * *')).toBe(true);
  });

  it('returns true for a 6-field expression with leading seconds', () => {
    expect(isSubMinuteCron('0 */5 * * * *')).toBe(true);
  });

  it('returns false for a standard 5-field cron expression', () => {
    expect(isSubMinuteCron('* * * * *')).toBe(false);
  });

  it('returns false for a specific 5-field expression', () => {
    expect(isSubMinuteCron('0 9 * * 1-5')).toBe(false);
  });

  it('returns false for every-5-minutes 5-field expression', () => {
    expect(isSubMinuteCron('*/5 * * * *')).toBe(false);
  });

  it('handles extra surrounding whitespace correctly', () => {
    expect(isSubMinuteCron('  * * * * *  ')).toBe(false);
    expect(isSubMinuteCron('  * * * * * *  ')).toBe(true);
  });
});

describe('isDue', () => {
  it('returns false for null', () => {
    expect(isDue(null)).toBe(false);
  });

  it('returns true when nextRunAt is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isDue(past)).toBe(true);
  });

  it('returns true when nextRunAt is exactly now (<=)', () => {
    // Use a timestamp slightly in the past to avoid flakiness
    const justNow = new Date(Date.now() - 1).toISOString();
    expect(isDue(justNow)).toBe(true);
  });

  it('returns false when nextRunAt is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isDue(future)).toBe(false);
  });

  it('returns false for an empty string (falsy)', () => {
    // Empty string is falsy — same branch as null
    expect(isDue('')).toBe(false);
  });
});
