import { formatEur } from './money';
import type { Expense } from './expense';

export interface ExpenseDayGroup {
  /** ISO date key (yyyy-MM-dd) of the group. */
  key: string;
  /** Human label matching the approved frames, e.g. "Jan 03, Sunday". */
  label: string;
  expenses: readonly Expense[];
}

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' });
const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

/** Groups expenses onto calendar days (newest first); shared by the list screen. */
export function groupExpensesByDay(expenses: readonly Expense[]): ExpenseDayGroup[] {
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

/** Formats an expense amount for a list row. */
export const expenseAmount = formatEur;
