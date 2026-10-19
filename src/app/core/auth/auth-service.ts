import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
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

/** API readiness failed before Google exchange; only this contract permits code reuse. */
export class ServiceStartingError extends AuthError {}

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
const SIGNED_OUT_KEY = 'guito.auth.signed-out';
const EPOCH_KEY = 'guito.auth.epoch';
const SESSION_LOCK = 'guito-auth-session';
const FOREGROUND_COALESCE_MS = 60_000;
// API operation 25s < gateway/host 30s < browser session HTTP 35s.
const SESSION_HTTP_TIMEOUT_MS = 35_000;

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
  epoch: string;
  exchangeAttempted?: boolean;
}

/** The popup went away without completing (user closed it) — abort, no fallback. */
class PopupAbandoned extends Error {}

/**
 * Surface the API's RFC 6749 `error`/`error_description` body (the exchange
 * endpoint returns Google's verbatim error) so a rejected sign-in is
 * diagnosable from the UI; falls back to the status-only message when the
 * body isn't that JSON. Contains no credentials — safe to display.
 */
async function sessionFailure(response: Response, base: string): Promise<AuthError> {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      error_description?: unknown;
    };
    const error = typeof body.error === 'string' ? body.error : '';
    const description = typeof body.error_description === 'string' ? body.error_description : '';
    if (response.status === 503 && error === 'service_starting')
      return new ServiceStartingError('The service is starting. Please try again.');
    if (!error && !description) return new AuthError(base);
    return new AuthError([error, description].filter(Boolean).join(' — '));
  } catch {
    return new AuthError(base);
  }
}

/**
 * Google OAuth 2.0 + PKCE authorization-code flow (no implicit flow, no secret
 * — the web client is a public client). Auth state is a signal persisted to
 * localStorage as a short-lived cache; the server cookie owns renewal/expiry.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly env = inject(APP_ENVIRONMENT);

  /** In-flight PKCE pair + intended destination; sessionStorage = dies with the tab. */
  private readonly pending = signal<PendingSignIn | null>(readPending());

  readonly session = signal<AuthSession | null>(readPersistedSession());
  readonly isAuthenticated = computed(() => {
    const s = this.session();
    return s?.persistent === true && !isExpired(s) && !localStorage.getItem(SIGNED_OUT_KEY);
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
   * Rejects when abandoned or superseded by a newer browser login/logout.
   */
  async signIn(returnUrl: string = '/'): Promise<string | undefined> {
    const epoch = crypto.randomUUID();
    localStorage.setItem(EPOCH_KEY, epoch);
    const pending: PendingSignIn = {
      verifier: createCodeVerifier(),
      state: generateState(),
      returnUrl,
      epoch,
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
      } catch (cause) {
        if (pending.epoch !== localStorage.getItem(EPOCH_KEY)) throw cause;
        // Reuse the callback card without exchanging again on entry. A popup
        // failure must not silently start Google or replay its one-use code.
        const underlying = cause instanceof AuthError ? cause.cause : undefined;
        const sessionError =
          cause instanceof ServiceStartingError
            ? 'service_starting'
            : underlying instanceof DOMException && underlying.name === 'TimeoutError'
              ? 'timeout'
              : underlying instanceof TypeError
                ? 'connectivity'
                : 'exchange_failed';
        return `${AUTH_CALLBACK_PATH}?${new URLSearchParams({ ...handoff, sessionError })}`;
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
      if (this.pending()?.epoch !== localStorage.getItem(EPOCH_KEY))
        throw new AuthError('Sign-in was cancelled.');
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
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  /**
   * Handle the `/auth/callback` query params: validate state, exchange the
   * authorization code for tokens, persist the session. Resolves with the
   * returnUrl to route to; rejects with `AuthError` on any failure.
   */
  async completeSignIn(params: Record<string, string>): Promise<string> {
    const epoch = localStorage.getItem(EPOCH_KEY);
    const pending = this.pending();
    if (!pending) {
      // No code/error variant distinction matters: any callback without the
      // pending PKCE pair is stale or replayed (Android PWA cold start on an
      // old /auth/callback URL, or the pair died with the session) — the
      // callback component restarts the flow (issue #57).
      throw new StaleSignInError('No sign-in in progress — stale callback');
    }

    if (pending.epoch !== epoch) {
      this.clearPending();
      throw new StaleSignInError('Sign-in was cancelled in another tab.');
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
      tokenResponse = await this.withSessionLock(() => {
        if (epoch !== localStorage.getItem(EPOCH_KEY))
          throw new AuthError('Sign-in was cancelled.');
        if (!this.pending() || this.pending()?.exchangeAttempted)
          throw new AuthError(
            'Sign-in may already have been attempted. Please restart with Google.',
          );
        const attempted = { ...pending, exchangeAttempted: true };
        this.pending.set(attempted);
        sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(attempted));
        return fetch(`${this.env.apiBaseUrl}/Auth/session/token`, {
          method: 'POST',
          credentials: 'include',
          signal: AbortSignal.timeout(SESSION_HTTP_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json', 'X-Guito-Session': '1' },
          body: JSON.stringify({
            code: params['code'] ?? '',
            codeVerifier: pending.verifier,
            redirectUri: this.redirectUri(),
          }),
        });
      });
    } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw new AuthError(
        cause instanceof DOMException && cause.name === 'TimeoutError'
          ? 'Sign-in timed out. The service may be unavailable. Please try again.'
          : 'Could not reach the token exchange endpoint',
        { cause },
      );
    }
    if (!tokenResponse.ok) {
      const failure = await sessionFailure(
        tokenResponse,
        `Sign-in token exchange failed (HTTP ${tokenResponse.status})`,
      );
      if (failure instanceof ServiceStartingError && epoch === localStorage.getItem(EPOCH_KEY)) {
        this.pending.set(pending);
        sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pending));
      }
      throw failure;
    }

    const session = await this.readTokenResponse(tokenResponse);
    if (epoch !== localStorage.getItem(EPOCH_KEY)) throw new AuthError('Sign-in was cancelled.');
    this.clearPending();
    localStorage.removeItem(SIGNED_OUT_KEY);
    this.setSession(session);
    return pending.returnUrl;
  }

  /** Clear this browser immediately; never revoke the shared Google grant. */
  signOut(): string {
    localStorage.setItem(SIGNED_OUT_KEY, '1');
    localStorage.setItem(EPOCH_KEY, crypto.randomUUID());
    this.clearPending();
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.session.set(null);
    void this.withSessionLock(() => this.sessionRequest('logout')).catch(() => undefined);
    return SIGN_OUT_REDIRECT;
  }

  hasPendingSignIn(): boolean {
    return this.pending() !== null;
  }

  pendingReturnUrl(): string {
    return this.pending()?.returnUrl ?? '/';
  }

  /** Only a bounded cache of a successful foreground renewal can skip networking. */
  isSessionReady(): boolean {
    const session = readPersistedSession();
    this.session.set(session);
    return (
      !localStorage.getItem(SIGNED_OUT_KEY) && session?.persistent === true && this.isFresh(session)
    );
  }

  private renewal: Promise<boolean> | undefined;

  constructor() {
    const onStorage = (event: StorageEvent): void => {
      if (![SESSION_STORAGE_KEY, SIGNED_OUT_KEY, EPOCH_KEY, null].includes(event.key)) return;
      this.session.set(readPersistedSession());
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /** Bootstrap, foreground and request gate. No timer and no business replay. */
  ensureSession(): Promise<boolean> {
    if (localStorage.getItem(SIGNED_OUT_KEY)) {
      this.session.set(null);
      return Promise.resolve(false);
    }
    const cached = readPersistedSession();
    this.session.set(cached);
    // Legacy token-only clients need one explicit consent/login, not a pretend cookie.
    if (cached?.persistent !== true) return Promise.resolve(false);
    if (document.visibilityState === 'hidden')
      return Promise.reject(new AuthError('Return to Guito to renew your session.'));
    if (this.isFresh(cached)) return Promise.resolve(true);
    if (this.renewal) return this.renewal;
    const epoch = localStorage.getItem(EPOCH_KEY);
    const operation = this.withSessionLock(async () => {
      if (!this.isCurrent(epoch)) return false;
      const shared = readPersistedSession();
      // A second tab may have renewed while this tab waited for the Web Lock.
      if (shared?.persistent && this.isFresh(shared) && shared.refreshedAt !== cached.refreshedAt) {
        this.session.set(shared);
        return true;
      }
      let response: Response;
      try {
        response = await this.sessionRequest('refresh');
      } catch (cause) {
        if (!this.isCurrent(epoch)) return false;
        throw new AuthError(
          cause instanceof DOMException && cause.name === 'TimeoutError'
            ? 'Session renewal timed out. The service may be unavailable. Please try again.'
            : 'Could not renew your session. Check your connection and try again.',
          { cause },
        );
      }
      if (!this.isCurrent(epoch)) return false;
      if (response.status === 401) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        this.session.set(null);
        return false;
      }
      if (!response.ok)
        throw await sessionFailure(response, 'Could not renew your session. Please try again.');
      const renewed = await this.readTokenResponse(response);
      if (!this.isCurrent(epoch)) return false;
      this.setSession(renewed);
      return true;
    });
    this.renewal = operation;
    void operation
      .finally(() => {
        if (this.renewal === operation) this.renewal = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  private isFresh(session: AuthSession): boolean {
    const age = Date.now() - (session.refreshedAt ?? 0);
    return (
      !isExpired(session) &&
      age >= 0 &&
      age < FOREGROUND_COALESCE_MS &&
      Date.parse(session.sessionExpiresAt ?? '') > Date.now()
    );
  }

  private isCurrent(epoch: string | null): boolean {
    return epoch === localStorage.getItem(EPOCH_KEY) && !localStorage.getItem(SIGNED_OUT_KEY);
  }

  private sessionRequest(action: 'refresh' | 'logout'): Promise<Response> {
    return fetch(`${this.env.apiBaseUrl}/Auth/session/${action}`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(SESSION_HTTP_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'X-Guito-Session': '1' },
      body: '{}',
    });
  }

  private withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
    // Web Locks serialize cookie mutations across same-origin tabs. Generation
    // checks still protect local state on browsers without Web Locks.
    return navigator.locks ? navigator.locks.request(SESSION_LOCK, operation) : operation();
  }

  private async readTokenResponse(response: Response): Promise<AuthSession> {
    const { idToken, accessToken, expiresIn, sessionExpiresAt } = (await response.json()) as Record<
      string,
      unknown
    >;
    if (
      typeof idToken !== 'string' ||
      !idToken ||
      typeof accessToken !== 'string' ||
      !accessToken ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 30 ||
      typeof sessionExpiresAt !== 'string' ||
      !Number.isFinite(Date.parse(sessionExpiresAt))
    ) {
      throw new AuthError('Session response was malformed. Please try again.');
    }
    return {
      idToken,
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      persistent: true,
      sessionExpiresAt,
      refreshedAt: Date.now(),
    };
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
