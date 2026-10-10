import type { IconName } from '../../../shared/gicon';

/** Mirrors the API Expense contract (description, amount, date); extra fields are UI stubs. */
export interface Expense {
  id: string;
  description: string;
  /** Positive Expense outflow, in EUR; legacy signed values render unchanged. */
  amount: number;
  /** Offset occurrence timestamp, falling back to legacy date until API cutover. */
  date: string;
  /** Category supplied by the API. */
  category: string;
  /** Stub-only: lucide icon name rendered by the category badge. */
  icon: IconName;
}
