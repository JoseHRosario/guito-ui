import { describe, expect, it } from 'vitest';
import { expenseSummary, monthLabelOf } from './expense-summary';
import type { Expense } from '../features/expenses/models/expense';

function expense(amount: number, date: string): Expense {
  return { id: 'x', description: 'X', amount, date, category: '', icon: 'tag' };
}

describe('expenseSummary', () => {
  it('splits outflows and inflows with a net total', () => {
    const summary = expenseSummary([expense(-100, '2021-01-03'), expense(-23.5, '2021-01-02'), expense(8700, '2021-01-01')]);
    expect(summary).toEqual({ expense: 123.5, income: 8700, total: 8576.5 });
  });

  it('returns zeros for an empty list', () => {
    expect(expenseSummary([])).toEqual({ expense: 0, income: 0, total: 0 });
  });
});

describe('monthLabelOf', () => {
  it('labels the month of the newest expense', () => {
    expect(monthLabelOf([expense(-1, '2021-01-02T08:00:00'), expense(-1, '2021-01-03T10:12:00')])).toBe('January, 2021');
  });

  it('is empty when no expenses are loaded', () => {
    expect(monthLabelOf([])).toBe('');
  });
});