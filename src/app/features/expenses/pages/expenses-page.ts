import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { formatEur } from '../../../core/money';
import { groupExpensesByDay } from '../../../core/group-by-day';
import type { Expense } from '../models/expense';
import { ExpenseApi } from '../services/expense-api';
import { expenseSummary, monthLabelOf } from '../../../core/expense-summary';
import { GIcon } from '../../../shared/gicon';
import { MonthNav } from '../components/month-nav';
import { SummaryBar } from '../components/summary-bar';
import type { MonthSummary } from '../models/month-summary';

/**
 * Latest-expenses screen, LIVE from the deployed API (guito-api#9): loads
 * `GET /Expense/latest/20` on entry (Bearer ID token via the auth
 * interceptor), with loading / error+retry / empty states; the summary bar
 * derives from the loaded data (the API has no summary endpoint).
 */
@Component({
  selector: 'g-expenses-page',
  templateUrl: './expenses-page.html',
  styleUrl: './expenses-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MonthNav, SummaryBar, GIcon, NgTemplateOutlet],
})
export class ExpensesPage {
  private readonly expenseApi = inject(ExpenseApi);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  /** Guards against a stale response (e.g. a retry racing a slow first load). */
  private loadSequence = 0;

  /** null = loading; empty array = loaded with no expenses. */
  protected readonly expenses = signal<readonly Expense[] | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly month = computed(() => monthLabelOf(this.expenses() ?? []));
  protected readonly summary = computed<MonthSummary>(() => expenseSummary(this.expenses() ?? []));
  protected readonly groups = computed(() => groupExpensesByDay(this.expenses() ?? []));
  protected readonly sidebarWallet = computed(() => formatEur(12450, { signed: true }));

  protected readonly amount = formatEur;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    const seq = ++this.loadSequence;
    void this.expenseApi.latest().then(
      (expenses) => {
        if (!this.destroyed && seq === this.loadSequence) this.expenses.set(expenses);
      },
      () => {
        if (!this.destroyed && seq === this.loadSequence) {
          this.loadError.set('Could not load your expenses — check your connection and try again.');
        }
      },
    );
  }
}
