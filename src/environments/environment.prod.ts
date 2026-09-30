/**
 * Production environment (CloudFront demo domain + the fixed prod API domain).
 * googleClientId must match GOOGLE_CLIENT_ID / OAuthAudience on the deployed authorizer
 * and the OAuth client's authorized redirect URIs (…/auth/callback on the CloudFront domain).
 */
export const environment = {
  production: true,
  googleClientId: '665373918058-15r7orcfdr1tsi1uef1ev7f66fs17rtc.apps.googleusercontent.com',
  apiBaseUrl: 'https://guito.api.kerumirembora.com',
};
