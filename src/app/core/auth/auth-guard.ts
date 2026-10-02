import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';

/**
 * Inverse gate for the bare auth routes (`/signin`, `/auth/callback`): an
 * already-authenticated visitor is bounced to the app root instead of seeing
 * the sign-in screen or re-running a spent authorization-code exchange
 * (issue #36 — stale callback entries in history, incl. PWA cold start).
 */
export const signedInGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.parseUrl('/') : true;
};

/**
 * ADR-0011: every route is auth-gated. Unauthenticated visits redirect to
 * `/signin?returnUrl=<original url>`; the sign-in flow restores the original
 * destination after the OAuth callback lands.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/signin'], { queryParams: { returnUrl: state.url } });
};
