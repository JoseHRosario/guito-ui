import type { ExpenseDetail } from './expense-detail';

export type ExpenseUpdate = Pick<ExpenseDetail, 'amount' | 'description' | 'category' | 'bookingDate' | 'currency'>;
