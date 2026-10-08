/**
 * Production environment (fixed web + API domains).
 * googleClientId must match GOOGLE_CLIENT_ID / OAuthAudience on the deployed authorizer
 * and the OAuth client's authorized origins/redirect URIs (…/auth/callback on the web domain).
 */
export const environment = {
  production: true,
  googleClientId: '665373918058-15r7orcfdr1tsi1uef1ev7f66fs17rtc.apps.googleusercontent.com',
  apiBaseUrl: 'https://guito.api.kerumirembora.com',
  version: '0.0.0-dev',
  // Production pair (settled MVP bank, issue #64).
  bankName: 'Activo Bank',
  bankCountry: 'PT',
  bankCountryLabel: 'Portugal',
};
