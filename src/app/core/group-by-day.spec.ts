import { describe, expect, it } from 'vitest';
import { groupExpensesByDay } from './group-by-day';
import type { Expense } from './expense';

function expense(id: string, date: string, description = 'X'): Expense {
  return { id, description, amount: -10, date, category: 'Bills', icon: 'zap' };
}

describe('groupExpensesByDay', () => {
  it('groups expenses onto their calendar day, newest day first', () => {
    const groups = groupExpensesByDay([
      expense('a', '2021-01-02T10:00:00'),
      expense('b', '2021-01-03T09:00:00'),
      expense('c', '2021-01-03T20:00:00'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2021-01-03', '2021-01-02']);
    expect(groups[0].expenses.map((e) => e.id)).toEqual(['b', 'c']);
    expect(groups[1].expenses.map((e) => e.id)).toEqual(['a']);
  });

  it('labels a group like the approved frames: "Jan 03, Sunday"', () => {
    const [only] = groupExpensesByDay([expense('a', '2021-01-03T12:00:00')]);
    expect(only.label).toBe('Jan 03, Sunday');
  });

  it('returns an empty list for no expenses', () => {
    expect(groupExpensesByDay([])).toEqual([]);
  });
});
