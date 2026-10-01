import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { formatEur } from '../services/money';
import type { MonthSummary } from '../models/month-summary';

// --- list-model helpers (folded single-consumer helpers, guito-api#40/#9) ---

export interface ExpenseDayGroup {
  /** ISO date key (yyyy-MM-dd) of the group. */
  key: string;
  /** Human label matching the approved frames, e.g. "Jan 03, Sunday". */
  label: string;
  expenses: readonly Expense[];
}

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' });
const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

/** Groups expenses onto calendar days (newest first). */
function groupExpensesByDay(expenses: readonly Expense[]): ExpenseDayGroup[] {
  const byDay = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const day = expense.date.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), expense]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, group]) => {
      const date = new Date(key + 'T12:00:00');
      return { key, label: `${dayLabel.format(date)}, ${weekdayLabel.format(date)}`, expenses: group };
    });
}

/** EXPENSE = outflows, INCOME = inflows, TOTAL = net; the API has no summary endpoint. */
function expenseSummary(expenses: readonly Expense[]): MonthSummary {
  let outflow = 0;
  let inflow = 0;
  for (const expense of expenses) {
    if (expense.amount < 0) outflow += -expense.amount;
    else inflow += expense.amount;
  }
  return { expense: outflow, income: inflow, total: inflow - outflow };
}

const longMonth = new Intl.DateTimeFormat('en-US', { month: 'long' });

/** The list's month label (e.g. "January, 2021"), from the newest expense; '' when empty. */
function monthLabelOf(expenses: readonly Expense[]): string {
  const newest = expenses.reduce<string | null>(
    (latest, expense) => (latest === null || expense.date > latest ? expense.date : latest),
    null,
  );
  if (newest === null) return '';
  const date = new Date(newest);
  return `${longMonth.format(date)}, ${date.getFullYear()}`;
}
import type { Expense } from '../models/expense';
import { ExpenseApi } from '../services/expense-api';
import { GIcon } from '../../../shared/gicon';
import { MonthNav } from '../components/month-nav';
import { SummaryBar } from '../components/summary-bar';

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
  private readonly router = inject(Router);
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

  /** "Expense saved" toast (frame 3094:10243): bottom-center above nav, auto-dismiss ~3s. */
  protected readonly savedToast = signal(false);

  protected readonly amount = formatEur;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    this.load();
    // The create page lands back here with saved=1 → show the toast once, then clear the param.
    this.router.events.subscribe((event) => {
      if (this.destroyed || !(event instanceof NavigationEnd)) return;
      if (this.router.parseUrl(event.urlAfterRedirects).queryParams['saved'] === '1') {
        this.savedToast.set(true);
        setTimeout(() => {
          if (!this.destroyed) {
            this.savedToast.set(false);
            void this.router.navigate([], { queryParams: { saved: null }, queryParamsHandling: 'merge' });
          }
        }, 3000);
      }
    });
  }

  protected createExpense(): void {
    void this.router.navigate(['/expenses/create']);
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
