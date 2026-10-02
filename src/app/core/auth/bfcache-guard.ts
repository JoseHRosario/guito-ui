import { AuthService } from './auth-service';

/**
 * bfcache restores (browser Back after sign-out, PWA restore) skip Angular's
 * router and guards entirely — no code runs, so a signed-in view restored
 * after sign-out stays on screen and interactive (issue guito-ui#39). The
 * accepted standard (José): a brief flicker is fine; a lingering signed-in
 * view is not. On a `pageshow` restore, re-run the auth check and bounce an
 * unauthenticated restore to `/signin`.
 *
 * Pure wiring: auth, redirect and the listener registrar are injected seams
 * so the behavior is testable without a real bfcache.
 */
export function guardBfcacheRestores(
  auth: AuthService,
  redirect: (url: string) => void,
  addListener: (type: string, handler: (event: { persisted: boolean }) => void) => void = (type, handler) =>
    window.addEventListener(type, handler as unknown as EventListener),
): void {
  addListener('pageshow', (event) => {
    if (event.persisted && !auth.isAuthenticated()) redirect('/signin');
  });
}
