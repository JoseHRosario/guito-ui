import { Expense } from './expense';

/** Stubbed expense data mirroring the approved Figma frames (guito-api#40). No live API wiring yet. */
export const STUB_EXPENSES: Expense[] = [
  { id: '1', description: 'H&M', amount: -65.55, date: '2021-01-03T10:12:00', category: 'Clothing', icon: 'tag' },
  { id: '2', description: 'T-Mobile', amount: -80.0, date: '2021-01-03T11:30:00', category: 'Broadband', icon: 'wifi' },
  { id: '3', description: 'Walmart', amount: -120.0, date: '2021-01-03T14:45:00', category: 'Shopping', icon: 'shopping-bag' },
  { id: '4', description: 'Con Edison', amount: -150.6, date: '2021-01-03T18:20:00', category: 'Bills', icon: 'zap' },
  { id: '5', description: 'Netflix', amount: -30.15, date: '2021-01-02T08:00:00', category: 'Entertainment', icon: 'film' },
  { id: '6', description: 'Starbucks', amount: -55.0, date: '2021-01-02T09:15:00', category: 'Snacks', icon: 'utensils' },
  { id: '7', description: 'CVS Pharmacy', amount: -78.4, date: '2021-01-02T17:40:00', category: 'Health', icon: 'heart' },
];

/** Stubbed month summary (EXPENSE / INCOME / TOTAL), mirroring the frames. */
export const STUB_SUMMARY = { expense: 4853.72, income: 8700.0, total: 3846.28 };

export const STUB_MONTH_LABEL = 'January, 2021';
