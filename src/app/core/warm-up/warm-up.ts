/** Fire-and-forget Lambda warm-up: one healthz hit so the container starts while the user auths. */
export function warmUpApi(apiBaseUrl: string, fetchFn: typeof fetch = fetch): Promise<void> {
  return fetchFn(`${apiBaseUrl}/healthz`).then(
    () => undefined,
    () => undefined,
  );
}