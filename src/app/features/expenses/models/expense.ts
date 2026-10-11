import type { IconName } from '../../../shared/gicon';

/** Latest expense adapted for list rendering, with one exact amount and booking timestamp. */
export interface Expense {
  /** null only for pre-cutover rows without a durable numeric expense ID. */
  id: number | null;
  description: string;
  amount: string | null;
  bookingDate: string | null;
  category: string;
  icon: IconName;
}
