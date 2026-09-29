/** Signed-in state, persisted so auth survives reloads. */
export interface AuthSession {
  /** Google ID token (what the API validates). */
  idToken: string;
  /** Google access token. */
  accessToken: string;
  /** Epoch ms when the token set expires (Google ~1h). */
  expiresAt: number;
}

/**
 * Clock-skew margin: consider a session expired slightly early so we never
 * fire a request with a token that dies mid-flight.
 */
const SKEW_MARGIN_MS = 30_000;

export function isExpired(session: AuthSession): boolean {
  return Date.now() >= session.expiresAt - SKEW_MARGIN_MS;
}

const SESSION_KEY = 'guito.auth.session';

export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session);
}

export function parseSession(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as AuthSession).idToken === 'string' &&
      typeof (value as AuthSession).accessToken === 'string' &&
      typeof (value as AuthSession).expiresAt === 'number'
    ) {
      return value as AuthSession;
    }
    return null;
  } catch {
    return null;
  }
}

/** localStorage persistence (across reloads). Module-level so tests can relocate it. */
export const SESSION_STORAGE_KEY = SESSION_KEY;
