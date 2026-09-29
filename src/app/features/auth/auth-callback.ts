import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, AuthService } from '../../core/auth/auth-service';

/**
 * Landing for the Google OAuth redirect (`/auth/callback`). Exchanges the
 * authorization code and routes to the originally requested page; on failure
 * shows the error and offers a retry instead of a broken redirect loop.
 */
@Component({
  selector: 'guito-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as err) {
      <div class="flex min-h-dvh items-center justify-center p-6" data-testid="auth-error">
        <div class="card w-full max-w-sm bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title text-error">Sign-in failed</h2>
            <p>{{ err }}</p>
            <div class="card-actions justify-end">
              <button class="btn btn-primary" type="button" (click)="retry()">Try again</button>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="flex min-h-dvh items-center justify-center p-6">
        <span class="loading loading-spinner loading-lg" aria-label="Signing in"></span>
      </div>
    }
  `,
})

export class AuthCallback {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params bound via withComponentInputBinding (defaults per AGENTS rule). */
  readonly code = input<string>('');
  readonly state = input<string>('');
  readonly error = input<string>('');

  readonly message = signal('');

  private started = false;

  constructor() {
    // Runs once when the router-bound query params land (code/state or error).
    effect(() => {
      if (this.code() === '' && this.error() === '') return;
      if (this.started) return;
      this.started = true;
      void this.complete();
    });
  }

  async complete(): Promise<void> {
    if (this.error()) {
      this.message.set(`Google sign-in failed: ${this.error()}`);
      return;
    }
    try {
      const returnUrl = this.safeReturnUrl(await this.auth.completeSignIn({
        code: this.code(),
        state: this.state(),
      }));
      await this.router.navigateByUrl(returnUrl);
    } catch (cause) {
      this.message.set(
        cause instanceof AuthError ? cause.message : 'Sign-in failed — please try again.',
      );
    }
  }

  retry(): void {
    void this.auth.signIn('/');
  }

  /** Only navigate to relative paths — an absolute/foreign returnUrl is an open-redirect vector. */
  private safeReturnUrl(url: string): string {
    return url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}

