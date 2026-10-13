/** Wire shape of a linked account; distinct from the normalized Settings model. */
export interface BankConnectionDto {
  name?: string | null;
  ibanMasked?: string | null;
  currency?: string | null;
  aspspName?: string | null;
  aspspCountry?: string | null;
  consentStatus?: string | null;
  consentExpiresAt?: string | null;
}
