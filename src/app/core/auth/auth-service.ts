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
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PKCE_STORAGE_KEY = 'guito.auth.pkce';
const AUTH_CALLBACK_PATH = '/auth/callback';
const SIGN_OUT_REDIRECT = '/signin';

interface PendingSignIn {
  verifier: string;
  state: string;
  returnUrl: string;
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

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params['code'] ?? '',
      code_verifier: pending.verifier,
      client_id: this.env.googleClientId,
      redirect_uri: this.redirectUri(),
    });

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(TOKEN_URL, { method: 'POST', body });
    } catch (cause) {
      throw new AuthError('Could not reach the Google token endpoint', { cause });
    }
    if (!tokenResponse.ok) {
      throw new AuthError(`Google token endpoint rejected the exchange (HTTP ${tokenResponse.status})`);
    }

    const tokens: unknown = await tokenResponse.json();
    const { id_token, access_token, expires_in } = tokens as Record<string, unknown>;
    if (typeof id_token !== 'string' || typeof access_token !== 'string' || typeof expires_in !== 'number') {
      this.clearPending();
      throw new AuthError('Google token response was malformed');
    }

    this.clearPending();
    this.setSession({
      idToken: id_token,
      accessToken: access_token,
      expiresAt: Date.now() + expires_in * 1000,
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
