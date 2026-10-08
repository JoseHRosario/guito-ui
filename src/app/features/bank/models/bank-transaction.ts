/**
 * A bank transaction row as shown in the Bank review page (guito-ui#61).
 * Mirrors the pending-GET contract of `GET /BankTransaction` (guito-api#91,
 * epic #82): pending = unmatched rows (`expense_id IS NULL`).
 *
 * CONTRACT NOTE: the endpoint is not implemented yet (guito-api#91 open) —
 * this DTO is the UI's provisional contract, coordinated with the sync
 * feature (#90: DBIT rows, amounts stored positive) and the Jev suggested
 * category (guito-api#112). Tolerant mapping keeps unknown/nullable fields
 * from breaking the page.
 */
export interface BankTransaction {
  /** Opaque row id (sync_key server-side). */
  id: string;
  /** Booking date as ISO yyyy-MM-dd. */
  date: string;
  /** Absolute amount in the account currency (outflows arrive positive). */
  amount: number;
  currency: string;
  /** Remittance information — the bank's raw description string. */
  description: string;
  /** Jev-suggested category name (guito-api#112); null = no suggestion, accept stays open. */
  suggestedCategory: string | null;
}

/** Result payload of `POST /BankTransaction/sync` (guito-api#90). */
export interface BankSyncResult {
  fetched: number;
  new: number;
}