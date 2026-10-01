/**
 * Staging environment (deployed staging web + staging API).
 * Same production-grade build flags as prod (angular.json → configurations.staging
 * replaces environment.ts with this file); only the API base differs.
 * googleClientId must match GOOGLE_CLIENT_ID / OAuthAudience on the STAGING
 * authorizer and the OAuth client's authorized origins/redirect URIs.
 */
export const environment = {
  production: true,
  googleClientId: '665373918058-15r7orcfdr1tsi1uef1ev7f66fs17rtc.apps.googleusercontent.com',
  apiBaseUrl: 'https://guito-staging.api.kerumirembora.com',
};
