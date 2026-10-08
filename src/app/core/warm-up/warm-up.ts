/** Fire-and-forget API warm-up (issue #59): one /warm hit so the container starts
 * (and the server-side bounded Postgres wake fires) while the user auths. */
export function warmUpApi(apiBaseUrl: string, fetchFn: typeof fetch = fetch): Promise<void> {
  return fetchFn(`${apiBaseUrl}/warm`).then(
    () => undefined,
    () => undefined,
  );
}