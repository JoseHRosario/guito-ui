/**
 * Fire-and-forget API warm-up (issue #59): one /warm GET warms the app
 * container (and fires the server-side bounded Postgres wake) while the user
 * auths. The response is resolved back so the version header can ride the
 * SAME call (single bootstrap request, José review) — errors are swallowed:
 * undefined on failure, no retry, no second call.
 */
export function warmUpApi(apiBaseUrl: string, fetchFn: typeof fetch = fetch): Promise<Response | undefined> {
  return fetchFn(`${apiBaseUrl}/warm`).then(
    (res) => res,
    () => undefined,
  );
}
