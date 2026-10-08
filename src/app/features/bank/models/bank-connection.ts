/**
 * One linked bank account as shown on the Settings bank-connection card
 * (issue #64; API contract guito-api#116/PR #117 — merged).
 * IBAN arrives masked server-side (last 4 only — the full number never
 * leaves the API), so the UI may render it verbatim.
 */
export interface BankConnection {
  /** Account display name, e.g. 'Conta Casa'. */
  name: string;
  /** Masked IBAN, e.g. '•••• 1234' — empty when the ASPSP provided none. */
  ibanMasked: string;
  currency: string;
  /** ASPSP that holds the consent, e.g. 'Activo Bank'. */
  aspspName: string;
  aspspCountry: string;
  /** EB consent state, e.g. 'VALID'; an expired consent drives the 409 reconnect flow. */
  consentStatus: string;
  /** Consent expiry as an ISO instant; null when the ASPSP reported none. */
  consentExpiresAt: string | null;
}
