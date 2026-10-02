/**
 * Sign-out revocation call (guito-api#64): asks the API to revoke the session's
 * Google access token at Google's revoke endpoint. Pure function with an
 * injectable fetch so tests can stub the transport; resolves/rejects to
 * `undefined` — the caller treats it as fire-and-forget.
 */
export async function revokeAccessToken(
  apiBaseUrl: string,
  idToken: string,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<undefined> {
  try {
    await fetchFn(`${apiBaseUrl}/Auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Human-auth contract (ADR-0003): BOTH headers carry the ID token —
        // the edge authorizer validates it as a Google ID token.
        Authorization: `Bearer ${idToken}`,
        'x-google-idtoken': idToken,
      },
      // The ACCESS token is what gets revoked.
      body: JSON.stringify({ accessToken }),
    });
    return undefined;
  } catch {
    return undefined;
  }
}
