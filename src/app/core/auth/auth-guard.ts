import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';

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
