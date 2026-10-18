import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { from, switchMap } from 'rxjs';
import { inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';

/**
 * Attaches the human-auth dual-header contract (ADR-0003) to requests aimed at
 * the guito API: `Authorization: Bearer <ID token>` (the gateway identity
 * source, validated by the edge authorizer) AND `x-google-idtoken` (validated
 * by the app's GoogleIdTokenMiddleware as defense-in-depth). External URLs
 * (Google endpoints) and unauthenticated state get no header — never leak the
 * token off-target. Matching is by URL origin, not string prefix, so a
 * lookalike host (`https://<api-host>.evil.com`) can never receive the token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiOrigin = new URL(inject(APP_ENVIRONMENT).apiBaseUrl).origin;
  if (new URL(req.url, location.origin).origin !== apiOrigin) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  // Public probes stay independent of human authentication.
  if (new URL(req.url, location.origin).pathname === '/healthz') return next(req);
  const authorize = () => {
    const session = auth.session()!;
    return next(
      req.clone({
        setHeaders: {
          Authorization: `Bearer ${session.idToken}`,
          'x-google-idtoken': session.idToken,
        },
      }),
    );
  };
  if (auth.isSessionReady()) return authorize();
  // Wait before sending. Never retry/replay any business request or response.
  return from(
    auth.ensureSession().catch(() => {
      throw new HttpErrorResponse({
        status: 503,
        statusText: 'Session renewal unavailable',
        error: { message: 'Could not renew your session. Please try again.' },
        url: req.url,
      });
    }),
  ).pipe(
    switchMap((ready) => {
      const session = auth.session();
      if (!ready || !session) {
        void router.navigate(['/signin'], {
          queryParams: { returnUrl: router.url },
          replaceUrl: true,
        });
        throw new HttpErrorResponse({ status: 401, statusText: 'Session expired', url: req.url });
      }
      return authorize();
    }),
  );
};
