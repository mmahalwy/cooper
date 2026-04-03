import { describe, it, expect } from 'vitest';
import { getDefaultScope } from '../scopes';

describe('getDefaultScope', () => {
  it('returns personal for gmail', () => {
    expect(getDefaultScope('gmail')).toBe('personal');
  });

  it('returns personal for googlecalendar', () => {
    expect(getDefaultScope('googlecalendar')).toBe('personal');
  });

  it('returns personal for googledrive', () => {
    expect(getDefaultScope('googledrive')).toBe('personal');
  });

  it('returns personal for outlook', () => {
    expect(getDefaultScope('outlook')).toBe('personal');
  });

  it('returns personal for notion', () => {
    expect(getDefaultScope('notion')).toBe('personal');
  });

  it('returns shared for posthog', () => {
    expect(getDefaultScope('posthog')).toBe('shared');
  });

  it('returns shared for linear', () => {
    expect(getDefaultScope('linear')).toBe('shared');
  });

  it('returns shared for slack', () => {
    expect(getDefaultScope('slack')).toBe('shared');
  });

  it('returns shared for sentry', () => {
    expect(getDefaultScope('sentry')).toBe('shared');
  });

  it('returns shared for unknown apps', () => {
    expect(getDefaultScope('some-random-app')).toBe('shared');
  });

  it('is case insensitive', () => {
    expect(getDefaultScope('Gmail')).toBe('personal');
    expect(getDefaultScope('GOOGLECALENDAR')).toBe('personal');
  });
});
