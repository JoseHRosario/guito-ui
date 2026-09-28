import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatEur } from '../../core/money';
import { groupExpensesByDay } from '../../core/group-by-day';
import type { Expense } from '../../core/expense';
import { STUB_EXPENSES, STUB_MONTH_LABEL, STUB_SUMMARY } from '../../core/stub-expenses';
import type { IconName } from '../../shared/gicon';
import { GIcon } from '../../shared/gicon';
import { MonthNav } from './month-nav';
import { SummaryBar } from './summary-bar';

@Component({
  selector: 'g-expenses-page',
  templateUrl: './expenses-page.html',
  styleUrl: './expenses-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MonthNav, SummaryBar, GIcon, NgTemplateOutlet],
})
export class ExpensesPage {
  // Stubbed defaults; route data (withComponentInputBinding) overrides when a live source exists.
  protected readonly month = input<string>(STUB_MONTH_LABEL);
  protected readonly expenses = input<readonly Expense[]>(STUB_EXPENSES);
  protected readonly summary = input<{ expense: number; income: number; total: number }>(STUB_SUMMARY);

  protected readonly groups = computed(() => groupExpensesByDay(this.expenses()));
  protected readonly sidebarWallet = computed(() => formatEur(12450, { signed: true }));

  protected amount(value: number): string {
    return formatEur(value);
  }
}
