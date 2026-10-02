import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth-service';
import { GIcon } from '../../../shared/gicon';

/**
 * `/signin` screen per the drafted Figma frames (mobile 3071:35, desktop
 * 3080:53) — pending José's Figma approval (the design-loop implement source);
 * the visual restyle pass is tracked separately (#41). Google-only auth
 * (ADR-0011).
 */
@Component({
  selector: 'g-signin',
  templateUrl: './signin.html',
  styleUrl: './signin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GIcon],
})
export class SignIn {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query param bound via withComponentInputBinding (defaults per AGENTS rule). */
  readonly returnUrl = input<string>('/');

  protected readonly safeReturnUrl = computed(() => sanitize(this.returnUrl()));

  /**
   * Popup flow: resolves with the returnUrl → swap this screen for it in place.
   * Full-page fallback: signIn resolves `undefined` after leaving for Google.
   * Popup closed by the user: signIn rejects → stay put.
   */
  protected async signIn(): Promise<void> {
    let url: string | undefined;
    try {
      url = await this.auth.signIn(this.safeReturnUrl());
    } catch {
      return;
    }
    if (url === undefined) return;
    await this.router.navigateByUrl(sanitize(url), { replaceUrl: true });
  }
}

/**
 * Only relative paths — an absolute/foreign returnUrl is an open-redirect
 * vector. `withComponentInputBinding` sets the bound input to undefined when
 * the query param is absent (direct /signin visits), so undefined maps to '/'.
 */
function sanitize(url: string | undefined): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}