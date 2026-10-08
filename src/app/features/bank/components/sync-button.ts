import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GIcon } from '../../../shared/gicon';

/**
 * Sync trigger of the Bank page (frame 3201:270 refresh button): while the
 * sync runs the icon swaps to a daisyUI spinner and the button disables —
 * the same in-flight pattern as the expense list's refresh button.
 */
@Component({
  selector: 'g-sync-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GIcon],
  template: `
    <button
      type="button"
      class="rounded-full bg-base-200 p-2"
      aria-label="Sync bank transactions"
      data-testid="sync-bank"
      [disabled]="syncing()"
      (click)="syncRequested.emit()"
    >
      @if (syncing()) {
        <span class="loading loading-sm" data-testid="sync-spinner"></span>
      } @else {
        <g-icon name="refresh-cw" class="size-5" />
      }
    </button>
  `,
})
export class SyncButton {
  readonly syncing = input(false);
  /** Click intent — the page owns the actual sync call. */
  readonly syncRequested = output<void>();
}