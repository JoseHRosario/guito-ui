import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth-service';
import { guardBfcacheRestores } from './bfcache-guard';

/**
 * Registers the bfcache sign-out guard at bootstrap (issue guito-ui#39):
 * restores of authenticated views after sign-out re-run the auth check and
 * redirect to `/signin` (replaceUrl keeps the restored entry out of history).
 */
export function provideBfcacheGuard(): EnvironmentProviders {
  return provideAppInitializer(() => {
    // Capture Router in the injection context — the pageshow handler fires
    // outside it, long after bootstrap.
    const auth = inject(AuthService);
    const router = inject(Router);
    guardBfcacheRestores(auth, (url) => void router.navigateByUrl(url, { replaceUrl: true }));
  });
}
