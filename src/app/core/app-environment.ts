import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** App-wide runtime config (env-selected at build time via fileReplacements). */
export const APP_ENVIRONMENT = new InjectionToken<Readonly<{
  production: boolean;
  /** Opt-in only after timestamp persistence is deployed; absent is legacy-safe. */
  expenseTimestampsEnabled?: boolean;
  googleClientId: string;
  apiBaseUrl: string;
  /** Build-stamped version (issue #49): CI substitutes deploy/version.sh's
   *  stamp for the 0.0.0-dev placeholder at build time; local builds keep it. */
  version: string;
  /**
   * The one hardcoded bank of the MVP link flow (issue #64; EB rejects unknown
   * ASPSP names with 422 "Wrong ASPSP name provided" — the name must match EB's
   * per-application /aspsps list exactly). Optional so spec env stubs stay
   * valid; BankApi/bank-connection-card fall back to the production pair.
   */
  bankName?: string;
  /** EB country code for the auth request, e.g. 'FI' (sandbox) / 'PT' (prod). */
  bankCountry?: string;
  /** Country word shown on the card, e.g. 'Finland' / 'Portugal'. */
  bankCountryLabel?: string;
}>>('APP_ENVIRONMENT', { factory: () => environment });
