/** Shared test double for the global fetch, used by the warm-up specs. */
export function stubFetch(
  behavior: (url: string) => Promise<Response>,
): { fetch: typeof fetch; calls: string[]; restore(): void } {
  const calls: string[] = [];
  const fake = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    return behavior(url);
  }) as typeof fetch;
  const original = globalThis.fetch;
  return {
    fetch: fake,
    calls,
    restore: () => (globalThis.fetch = original),
  };
}