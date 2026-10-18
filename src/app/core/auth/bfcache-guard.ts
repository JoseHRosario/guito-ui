import { AuthService } from './auth-service';

/** Restores bypass Angular guards. Refresh first, never confuse offline with logout. */
export function guardBfcacheRestores(
  auth: AuthService,
  redirect: (url: string) => void,
  addListener: (type: string, handler: (event: { persisted: boolean }) => void) => void = (
    type,
    handler,
  ) => window.addEventListener(type, handler as unknown as EventListener),
  requestedUrl: () => string = () => '/',
): void {
  addListener('pageshow', (event) => {
    if (event.persisted) void restoreForegroundSession(auth, redirect, requestedUrl());
  });
}

export async function restoreForegroundSession(
  auth: AuthService,
  redirect: (url: string) => void,
  url: string,
): Promise<void> {
  if (url.startsWith('/signin') || url.startsWith('/auth/')) return;
  try {
    if (!(await auth.ensureSession())) redirect(`/signin?returnUrl=${encodeURIComponent(url)}`);
  } catch {
    redirect(`/auth/renew?returnUrl=${encodeURIComponent(url)}`);
  }
}
