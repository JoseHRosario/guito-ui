import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
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

  /** Query param bound via withComponentInputBinding (defaults per AGENTS rule). */
  readonly returnUrl = input<string>('/');

  protected readonly safeReturnUrl = computed(() => sanitize(this.returnUrl()));

  protected signIn(): void {
    void this.auth.signIn(this.safeReturnUrl());
  }
}

/** Only relative paths — an absolute/foreign returnUrl is an open-redirect vector. */
function sanitize(url: string): string {
  return url.startsWith('/') && !url.startsWith('//') ? url : '/';
}