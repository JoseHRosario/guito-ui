import type { BankReviewStatus } from './bank-review-status';
import type { LinkedExpense } from './linked-expense';
import type { SuggestedCategory } from './suggested-category';

/** Bank Int64 identity stays text; amounts remain exact invariant decimals. */
export interface BankTransaction {
  id: string;
  accountUid: string;
  date: string;
  amount: string;
  currency: string;
  description: string;
  status: string;
  reviewStatus: BankReviewStatus;
  suggestedCategory: SuggestedCategory | null;
  linkedExpense: LinkedExpense | null;
}
