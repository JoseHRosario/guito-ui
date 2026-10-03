import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GIcon } from '../../../shared/gicon';

/** ‹month› + refresh control bar shared by mobile and desktop frames (issue #47: the search/filter button is gone). */
@Component({
  selector: 'g-month-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GIcon],
  template: `
    <div class="flex w-full items-center justify-center gap-4 py-3">
      <button type="button" class="rounded-full border border-base-content/10 p-2" aria-label="Previous month">
        <g-icon name="chevron-left" class="size-5" />
      </button>
      <p class="min-w-[140px] text-center text-2xl font-semibold tracking-tight text-base-content">{{ month() }}</p>
      <button type="button" class="rounded-full border border-base-content/10 p-2" aria-label="Next month">
        <g-icon name="chevron-right" class="size-5" />
      </button>
      <button
        type="button"
        class="rounded-full bg-base-200 p-2"
        aria-label="Refresh expenses"
        data-testid="refresh-expenses"
        (click)="refreshed.emit()"
      >
        <g-icon name="refresh-cw" class="size-5" />
      </button>
    </div>
  `,
})
export class MonthNav {
  readonly month = input.required<string>();
  /** Manual reload of the latest expenses (issue #47 follow-up). */
  readonly refreshed = output<void>();
}
