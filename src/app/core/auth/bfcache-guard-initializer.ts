import { DestroyRef, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth-service';
import { guardBfcacheRestores, restoreForegroundSession } from './bfcache-guard';

/** User foreground activity only. No periodic/background keepalive. */
export function provideBfcacheGuard(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const redirect = (url: string): void => {
      void router.navigateByUrl(url, { replaceUrl: true });
    };
    guardBfcacheRestores(auth, redirect, undefined, () => router.url);
    const foreground = (): void => {
      if (document.visibilityState === 'visible')
        void restoreForegroundSession(auth, redirect, router.url);
    };
    const storage = (event: StorageEvent): void => {
      if (
        event.key !== 'guito.auth.signed-out' &&
        event.key !== 'guito.auth.session' &&
        event.key !== null
      )
        return;
      if (router.url.startsWith('/signin') && auth.isSessionReady()) {
        const target = router.parseUrl(router.url).queryParams['returnUrl'] as unknown;
        redirect(
          typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
            ? target
            : '/',
        );
      } else foreground();
    };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('storage', storage);
    });
  });
}
