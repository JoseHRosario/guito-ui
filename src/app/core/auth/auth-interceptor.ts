import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { AuthService } from './auth-service';

/**
 * Attaches `Authorization: Bearer <Google ID token>` to requests aimed at the
 * guito API (ADR-0004 human-auth contract). External URLs (Google endpoints)
 * and unauthenticated state get no header — never leak the token off-target.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBaseUrl = inject(APP_ENVIRONMENT).apiBaseUrl;
  if (!req.url.startsWith(apiBaseUrl)) {
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