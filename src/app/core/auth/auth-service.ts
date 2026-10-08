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
import { revokeAccessToken } from './revoke-access-token';

/** Thrown for any sign-in failure the callback component should surface. */
export class AuthError extends Error {}

/**
 * The callback page ran with an authorization code but no pending PKCE state:
 * the callback URL outlived the sign-in that created it (Android PWA restores
 * the task on the stale `/auth/callback?code=…` URL, or the pending pair died
 * with the session). Recoverable — the callback component restarts the flow
 * instead of showing the dead-end error card (issue #57).
 */
export class StaleSignInError extends AuthError {}

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const PKCE_STORAGE_KEY = 'guito.auth.pkce';
const AUTH_CALLBACK_PATH = '/auth/callback';
const SIGN_OUT_REDIRECT = '/signin';

// Popup sign-in (issue #36): desktop browsers open Google in a popup so the
// main window's history never gains a Google entry and Back after sign-in
// stays in the app. Standalone PWAs (Android) can't host popups reliably and
// keep the full-page redirect, which replaceUrl + signedInGuard already make
// Back-safe.
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;
/** Mutable so tests can shorten the waits — real code never touches it. */
export const popupTiming = { timeoutMs: 120_000, pollIntervalMs: 500 };
/** data.source marker on the postMessage the popup's callback page sends back. */
export const AUTH_POPUP_HANDOFF = 'guito-auth-popup-handoff';

interface PendingSignIn {
  verifier: string;
  state: string;
  returnUrl: string;
}

/** The popup went away without completing (user closed it) — abort, no fallback. */
class PopupAbandoned extends Error {}

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
   * Start the PKCE flow and persist the verifier/state pair.
   *
   * Desktop (popup-capable): Google opens in a popup; the popup's callback
   * page posts the authorization code back (AUTH_POPUP_HANDOFF) and the main
   * window completes the exchange. Resolves with the returnUrl — no Google
   * entry ever enters the main window's history, so Back after sign-in does
   * nothing (issue #36).
   *
   * Standalone PWA / blocked popup / handoff failure: falls back to the
   * full-page redirect. Resolves `undefined` once the redirect has been
   * initiated (the caller must not navigate); the pending PKCE pair is kept
   * so the /auth/callback redirect can complete the flow.
   *
   * Rejects only when the user abandons the popup (closed without completing).
   */
  async signIn(returnUrl: string = '/'): Promise<string | undefined> {
    const pending: PendingSignIn = {
      verifier: createCodeVerifier(),
      state: generateState(),
      returnUrl,
    };
    sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pending));
    this.pending.set(pending);

    const authorizeUrl = await this.buildAuthorizeUrl(pending);
    const popup = this.canUsePopup() ? this.openSignInPopup(authorizeUrl) : null;
    if (popup === null) {
      location.assign(authorizeUrl);
      return undefined;
    }

    try {
      const handoff = await this.waitForPopupHandoff(popup);
      try {
        return await this.completeSignIn(handoff);
      } finally {
        this.closeSignInPopup(popup);
      }
    } catch (cause) {
      if (cause instanceof PopupAbandoned) {
        this.clearPending();
        throw new AuthError('Sign-in window was closed before completing.', { cause });
      }
      // A failed exchange or malformed handoff: the full-page redirect's
      // error-card UX already handles every failure mode.
      this.clearPending();
      this.closeSignInPopup(popup);
      location.assign(authorizeUrl);
      return undefined;
    }
  }

  /** Standalone installed PWAs (Android) can't run the popup handoff reliably. */
  private canUsePopup(): boolean {
    if (typeof window.open !== 'function') return false;
    if (typeof window.matchMedia !== 'function') return true;
    return !window.matchMedia('(display-mode: standalone)').matches;
  }

  private openSignInPopup(authorizeUrl: string): Window | null {
    return window.open(
      authorizeUrl,
      'guito-signin',
      `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT}`,
    );
  }

  private closeSignInPopup(popup: Window): void {
    try {
      if (!popup.closed) popup.close();
    } catch {
      // A cross-origin popup late in its lifecycle may refuse close() — harmless.
    }
  }

  /**
   * Wait for the popup's /auth/callback page to post the authorization code
   * back. Only messages from OUR popup on OUR origin count; anything else is
   * ignored and the wait continues.
   */
  private waitForPopupHandoff(popup: Window): Promise<{ code: string; state: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const onMessage = (event: MessageEvent): void => {
        if (settled || event.origin !== location.origin || event.source !== popup) return;
        const data = event.data as {
          source?: unknown;
          code?: unknown;
          state?: unknown;
        } | null;
        if (!data || data.source !== AUTH_POPUP_HANDOFF) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(poll);
        clearTimeout(timeout);
        if (typeof data.code === 'string' && typeof data.state === 'string') {
          resolve({ code: data.code, state: data.state });
        } else {
          reject(new Error('Popup sign-in handoff was malformed.'));
        }
      };
      const poll = setInterval(() => {
        if (settled) return;
        if (popup.closed) {
          settled = true;
          window.removeEventListener('message', onMessage);
          clearInterval(poll);
          clearTimeout(timeout);
          reject(new PopupAbandoned('popup window was closed'));
        }
      }, popupTiming.pollIntervalMs);
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(poll);
        clearTimeout(timeout);
        reject(new Error('Popup sign-in handoff timed out.'));
      }, popupTiming.timeoutMs);
      window.addEventListener('message', onMessage);
    });
  }

  private async buildAuthorizeUrl(pending: PendingSignIn): Promise<string> {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.env.googleClientId,
      redirect_uri: this.redirectUri(),
      scope: 'openid email profile',
      state: pending.state,
      code_challenge: await codeChallenge(pending.verifier),
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  /**
   * Handle the `/auth/callback` query params: validate state, exchange the
   * authorization code for tokens, persist the session. Resolves with the
   * returnUrl to route to; rejects with `AuthError` on any failure.
   */
  async completeSignIn(params: Record<string, string>): Promise<string> {
    const pending = this.pending();
    if (!pending) {
      // No code/error variant distinction matters: any callback without the
      // pending PKCE pair is stale or replayed (Android PWA cold start on an
      // old /auth/callback URL, or the pair died with the session) — the
      // callback component restarts the flow (issue #57).
      throw new StaleSignInError('No sign-in in progress — stale callback');
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

  /**
   * Clear auth state (localStorage + signal) and revoke the session's Google
   * access token server-side (guito-api#64: POST /Auth/logout collapses the
   * copied-token validity window to ~0). Fire-and-forget: a failed/unreachable
   * endpoint NEVER blocks or delays the local sign-out. Returns the redirect
   * target.
   */
  signOut(): string {
    const session = this.session();
    if (session !== null) {
      // Headers carry the ID TOKEN (edge authorizer validates it); the ACCESS
      // token rides in the body — it's the one being revoked (guito-api#64).
      void revokeAccessToken(this.env.apiBaseUrl, session.idToken, session.accessToken, fetch).then(
        () => undefined,
        () => undefined,
      );
    }
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
