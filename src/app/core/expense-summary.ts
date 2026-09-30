import type { Expense } from '../features/expenses/models/expense';
import type { MonthSummary } from '../features/expenses/models/month-summary';

/**
 * Month summary derived from the loaded expenses (EXPENSE = outflows, INCOME =
 * inflows, TOTAL = net) — replaces the stubbed frame numbers once the list is
 * live (guito-api#9); the API has no summary endpoint.
 */
export function expenseSummary(expenses: readonly Expense[]): MonthSummary {
  let outflow = 0;
  let inflow = 0;
  for (const expense of expenses) {
    if (expense.amount < 0) outflow += -expense.amount;
    else inflow += expense.amount;
  }
  return { expense: outflow, income: inflow, total: inflow - outflow };
}

const longMonth = new Intl.DateTimeFormat('en-US', { month: 'long' });

/**
 * The list's month label (e.g. "January, 2021"), taken from the NEWEST
 * expense; "" when there is nothing loaded (the screen hides the nav bar).
 */
export function monthLabelOf(expenses: readonly Expense[]): string {
  const newest = expenses.reduce<string | null>(
    (latest, expense) => (latest === null || expense.date > latest ? expense.date : latest),
    null,
  );
  if (newest === null) return '';
  const date = new Date(newest);
  return `${longMonth.format(date)}, ${date.getFullYear()}`;
}