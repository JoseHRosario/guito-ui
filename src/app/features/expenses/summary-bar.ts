import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatEur } from '../../core/money';

export interface MonthSummary {
  expense: number;
  income: number;
  total: number;
}

/** EXPENSE / INCOME / TOTAL summary bar, mirroring the approved frames. */
@Component({
  selector: 'g-summary-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-full items-start gap-2 rounded-xl bg-base-200 px-4 py-3" role="group" aria-label="Month summary">
      <div class="flex min-w-0 flex-1 flex-col items-center gap-1">
        <p class="text-[11px] leading-normal font-bold text-base-content/50">EXPENSE</p>
        <p class="text-[15px] leading-normal font-bold text-error" data-testid="summary-expense">{{ expense() }}</p>
      </div>
      <div class="flex h-7 w-0 items-center justify-center border-r border-base-content/10"></div>
      <div class="flex min-w-0 flex-1 flex-col items-center gap-1">
        <p class="text-[11px] leading-normal font-bold text-base-content/50">INCOME</p>
        <p class="text-[15px] leading-normal font-bold text-success" data-testid="summary-income">{{ income() }}</p>
      </div>
      <div class="flex h-7 w-0 items-center justify-center border-r border-base-content/10"></div>
      <div class="flex min-w-0 flex-1 flex-col items-center gap-1">
        <p class="text-[11px] leading-normal font-bold text-base-content/50">TOTAL</p>
        <p class="text-[15px] leading-normal font-bold text-base-content" data-testid="summary-total">{{ total() }}</p>
      </div>
    </div>
  `,
})
export class SummaryBar {
  readonly summary = input.required<MonthSummary>();

  protected readonly expense = computed(() => formatEur(this.summary().expense));
  protected readonly income = computed(() => formatEur(this.summary().income));
  protected readonly total = computed(() => formatEur(this.summary().total));
}
