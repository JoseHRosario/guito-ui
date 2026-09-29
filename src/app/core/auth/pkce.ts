/**
 * PKCE (RFC 7636) helpers — pure functions, no Angular dependencies.
 * S256 method only: Google supports `plain` but S256 is the spec's SHOULD and
 * avoids shipping the verifier to the token endpoint un-hashed.
 */

const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** base64url (RFC 4648 §5) with padding stripped — the JWS encoding OAuth uses. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Random 64-char verifier (RFC bounds: 43–128 chars, unreserved set). */
export function createCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PKCE_CHARSET[b % PKCE_CHARSET.length]).join('');
}

/** S256 code challenge: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Opaque state for CSRF protection of the redirect. */
export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}