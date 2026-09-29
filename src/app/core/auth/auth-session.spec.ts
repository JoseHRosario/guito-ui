import { describe, expect, it } from 'vitest';
import { AuthSession, isExpired, serializeSession, parseSession } from './auth-session';

const session: AuthSession = {
  idToken: 'id.jwt.value',
  accessToken: 'at',
  expiresAt: Date.now() + 60_000,
};

describe('isExpired', () => {
  it('is false for a session with time left', () => {
    expect(isExpired({ ...session, expiresAt: Date.now() + 60_000 })).toBe(false);
  });

  it('is true once expiresAt has passed', () => {
    expect(isExpired({ ...session, expiresAt: Date.now() - 1 })).toBe(true);
  });

  it('treats expiresAt within the clock-skew margin as expired', () => {
    expect(isExpired({ ...session, expiresAt: Date.now() + 10_000 })).toBe(true);
  });
});

describe('parseSession', () => {
  it('round-trips a serialized session', () => {
    expect(parseSession(serializeSession(session))).toEqual(session);
  });

  it('returns null for garbage', () => {
    expect(parseSession('not json')).toBeNull();
    expect(parseSession('{"nope":true}')).toBeNull();
    expect(parseSession(null)).toBeNull();
  });
});