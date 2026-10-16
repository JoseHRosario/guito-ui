import { categoryIcon } from '../../expenses/services/category-icon';

export function dayLabel(value: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T12:00:00Z`);
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }).format(date)}, ${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date)}`;
}

/** Display-only debit convention from canonical List Expenses. Never alter wire amounts. */
export function debit(amount: string, currency: string): string {
  if (!amount) return '—';
  const value = amount.startsWith('-') ? amount : `-${amount.replace(/^\+/, '')}`;
  const format = new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format as unknown as (value: string) => string;
  return format(value);
}

export function expenseView<T extends { bookingDate: string; amount: string; currency: string; category: string }>(expense: T) {
  const instant = new Date(expense.bookingDate);
  return { ...expense, icon: categoryIcon(expense.category), displayAmount: debit(expense.amount, expense.currency),
    dateLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant),
    timeLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant),
  };
}
