import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';

/**
 * Attaches `Authorization: Bearer <Google ID token>` to requests aimed at the
 * guito API (ADR-0003 human-auth contract). External URLs (Google endpoints)
 * and unauthenticated state get no header — never leak the token off-target.
 * Matching is by URL origin, not string prefix, so a lookalike host
 * (`https://<api-host>.evil.com`) can never receive the token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiOrigin = new URL(inject(APP_ENVIRONMENT).apiBaseUrl).origin;
  if (new URL(req.url, location.origin).origin !== apiOrigin) {
    return next(req);
  }

  const auth = inject(AuthService);
  const session = auth.session();
  if (!auth.isAuthenticated() || session === null) {
    return next(req);
  }

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${session.idToken}` } }),
  );
};
