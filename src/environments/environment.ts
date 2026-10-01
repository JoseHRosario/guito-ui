/**
 * Dev/staging environment. Replaced at production build time by environment.prod.ts
 * (angular.json → fileReplacements).
 * googleClientId is a public value (OAuth web client, PKCE — no secret on the client).
 * apiBaseUrl points at the staging API (fixed custom domain) for local dev.
 */
export const environment = {
  production: false,
  googleClientId: '665373918058-15r7orcfdr1tsi1uef1ev7f66fs17rtc.apps.googleusercontent.com',
  apiBaseUrl: 'https://guito-staging.api.kerumirembora.com',
};
