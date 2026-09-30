import type { IconName } from '../../../shared/gicon';

/** Mirrors the API Expense contract (description, amount, date); extra fields are UI stubs. */
export interface Expense {
  id: string;
  description: string;
  /** Negative for outflows, positive for inflows, in EUR. */
  amount: number;
  /** ISO-8601 date(-time) as returned by the API. */
  date: string;
  /** Stub-only: the API contract has no category yet. */
  category: string;
  /** Stub-only: lucide icon name rendered by the category badge. */
  icon: IconName;
}
