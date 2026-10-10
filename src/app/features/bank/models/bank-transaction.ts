/**
 * A bank transaction row as shown in the Bank review page (guito-ui#61).
 * Mirrors the pending-GET contract of `GET /BankTransaction` (guito-api#91,
 * epic #82): pending = unmatched rows (`expense_id IS NULL`).
 *
 * Current sync imports debit outflows as positive amounts. The UI preserves
 * whatever sign and exact-amount metadata the API supplies when prefilling an
 * Expense; it does not normalize or negate values.
 * Tolerant mapping keeps unknown/nullable fields from breaking the page.
 */
export interface BankTransaction {
  /** Opaque row id (sync_key server-side). */
  id: string;
  /** Booking date as ISO yyyy-MM-dd. */
  date: string;
  /** Amount supplied by the API; current debit imports arrive positive. */
  amount: number;
  amountExact?: string;
  currency: string;
  /** Remittance information — the bank's raw description string. */
  description: string;
  /** Jev-suggested category (guito-api#112), id + name; null = no suggestion, accept stays open. */
  suggestedCategory: SuggestedCategory | null;
}

/** Result payload of `POST /BankTransaction/sync` (guito-api#90). */
export interface BankSyncResult {
  fetched: number;
  new: number;
}

/** Suggested-category contract of the pending GET (guito-api#112): id AND name. */
export interface SuggestedCategory {
  id: string;
  name: string;
}