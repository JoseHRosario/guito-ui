import { computed, inject, Injectable, signal } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import {
  AuthSession,
  isExpired,
  parseSession,
  serializeSession,
  SESSION_STORAGE_KEY,
} from './auth-session';
import { codeChallenge, createCodeVerifier, generateState } from './pkce';

/** Thrown for any sign-in failure the callback component should surface. */
export class AuthError extends Error {}

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const PKCE_STORAGE_KEY = 'guito.auth.pkce';
const AUTH_CALLBACK_PATH = '/auth/callback';
const SIGN_OUT_REDIRECT = '/signin';

interface PendingSignIn {
  verifier: string;
  state: string;
  returnUrl: string;
}

/**
 * Surface the API's RFC 6749 `error`/`error_description` body (the exchange
 * endpoint returns Google's verbatim error) so a rejected sign-in is
 * diagnosable from the UI; falls back to the status-only message when the
 * body isn't that JSON. Contains no credentials — safe to display.
 */
async function exchangeFailureMessage(response: Response): Promise<string> {
  const base = `Sign-in token exchange failed (HTTP ${response.status})`;
  try {
    const body = (await response.json()) as {
      error?: unknown;
      error_description?: unknown;
    };
    const error = typeof body.error === 'string' ? body.error : '';
    const description =
      typeof body.error_description === 'string' ? body.error_description : '';
    if (!error && !description) return base;
    return [error, description].filter(Boolean).join(' — ');
  } catch {
    return base;
  }
}

/**
 * Google OAuth 2.0 + PKCE authorization-code flow (no implicit flow, no secret
 * — the web client is a public client). Auth state is a signal persisted to
 * localStorage so it survives reloads; expired tokens force re-auth.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly env = inject(APP_ENVIRONMENT);

  /** In-flight PKCE pair + intended destination; sessionStorage = dies with the tab. */
  private readonly pending = signal<PendingSignIn | null>(readPending());

  readonly session = signal<AuthSession | null>(readPersistedSession());
  readonly isAuthenticated = computed(() => {
    const s = this.session();
    return s !== null && !isExpired(s);
  });

  /**
   * Start the PKCE flow: persist the verifier/state pair, then leave for the
   * Google consent screen. `returnUrl` is restored after the callback lands.
   */
  async signIn(returnUrl: string = '/'): Promise<void> {
    const verifier = createCodeVerifier();
    const pending: PendingSignIn = { verifier, state: generateState(), returnUrl };
    sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pending));
    this.pending.set(pending);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.env.googleClientId,
      redirect_uri: this.redirectUri(),
      scope: 'openid email profile',
      state: pending.state,
      code_challenge: await codeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    location.assign(`${AUTHORIZE_URL}?${params}`);
  }

  /**
   * Handle the `/auth/callback` query params: validate state, exchange the
   * authorization code for tokens, persist the session. Resolves with the
   * returnUrl to route to; rejects with `AuthError` on any failure.
   */
  async completeSignIn(params: Record<string, string>): Promise<string> {
    const pending = this.pending();
    if (!pending) {
      throw new AuthError('No sign-in in progress');
    }

    const error = params['error'];
    if (error) {
      this.clearPending();
      throw new AuthError(`Google sign-in failed: ${error}`);
    }

    if (params['state'] !== pending.state) {
      this.clearPending();
      throw new AuthError('Sign-in state mismatch — possible CSRF, restarting sign-in');
    }

    // The exchange runs SERVER-SIDE (guito-api issue #52): Google's token
    // endpoint requires a client_secret for Web-app clients, which must never
    // ship in the browser bundle — the API adds client_id + client_secret.
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(`${this.env.apiBaseUrl}/Auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: params['code'] ?? '',
          codeVerifier: pending.verifier,
          redirectUri: this.redirectUri(),
        }),
      });
    } catch (cause) {
      throw new AuthError('Could not reach the token exchange endpoint', { cause });
    }
    if (!tokenResponse.ok) {
      throw new AuthError(await exchangeFailureMessage(tokenResponse));
    }

    const tokens: unknown = await tokenResponse.json();
    const { idToken, accessToken, expiresIn } = tokens as Record<string, unknown>;
    if (typeof idToken !== 'string' || typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
      this.clearPending();
      throw new AuthError('Token exchange response was malformed');
    }

    this.clearPending();
    this.setSession({
      idToken: idToken,
      accessToken: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return pending.returnUrl;
  }

  /** Clear auth state (localStorage + signal). Returns the redirect target. */
  signOut(): string {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.session.set(null);
    return SIGN_OUT_REDIRECT;
  }

  private setSession(session: AuthSession): void {
    localStorage.setItem(SESSION_STORAGE_KEY, serializeSession(session));
    this.session.set(session);
  }

  private clearPending(): void {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    this.pending.set(null);
  }

  private redirectUri(): string {
    return `${location.origin}${AUTH_CALLBACK_PATH}`;
  }
}

function readPersistedSession(): AuthSession | null {
  return parseSession(localStorage.getItem(SESSION_STORAGE_KEY));
}

function readPending(): PendingSignIn | null {
  const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as PendingSignIn).verifier === 'string' &&
      typeof (value as PendingSignIn).state === 'string' &&
      typeof (value as PendingSignIn).returnUrl === 'string'
    ) {
      return value as PendingSignIn;
    }
    return null;
  } catch {
    return null;
  }
}
