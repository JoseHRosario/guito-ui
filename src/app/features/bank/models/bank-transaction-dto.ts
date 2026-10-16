import type { BankReviewStatus } from './bank-review-status';
import type { LinkedExpense } from './linked-expense';

/** HTTP Bank review row; numeric Int64 IDs are parsed losslessly before normalization. */
export interface BankTransactionDto {
  id?: number | string | null;
  accountUid?: string | null;
  bookingDate?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  remittanceInformation?: string | null;
  status?: string | null;
  reviewStatus?: BankReviewStatus;
  suggestedCategory?: { id: number | string; name: string } | null;
  linkedExpense?: LinkedExpense | null;
}
