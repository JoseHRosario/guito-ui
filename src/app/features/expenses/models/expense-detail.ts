/** Exact editable state and the opaque received CAS token (guito-api PR #148). */
export interface ExpenseDetail {
  id: number;
  amount: string;
  description: string;
  category: string;
  bookingDate: string;
  currency: 'EUR';
  revision: string;
  etag: string;
}
