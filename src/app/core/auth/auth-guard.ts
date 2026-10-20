import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';

/** Do not renew while a new PKCE exchange is pending. */
export const signedInGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (state.url.startsWith('/auth/callback') && auth.hasPendingSignIn()) return true;
  try {
    return (await auth.ensureSession()) ? router.parseUrl('/') : true;
  } catch {
    return router.createUrlTree(['/auth/renew'], { queryParams: { returnUrl: '/' } });
  }
};

/** Only a definitive session failure requires Google login. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    return (await auth.ensureSession())
      ? true
      : router.createUrlTree(['/signin'], { queryParams: { returnUrl: state.url } });
  } catch {
    return router.createUrlTree(['/auth/renew'], { queryParams: { returnUrl: state.url } });
  }
};
