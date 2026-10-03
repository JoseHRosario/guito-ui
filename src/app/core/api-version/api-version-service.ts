import { Injectable, signal } from '@angular/core';

/**
 * Holds the API build version (issue #51, guito-api#75). Captured ONCE at
 * bootstrap from the `X-Api-Version` response header of an anonymous
 * `GET {apiBaseUrl}/healthz` — every API response carries the header, the
 * healthz BODY is a plain probe with no version (never parse a JSON there).
 * The value answers "which API did this app session load against"; a reload
 * re-captures it. Capture failures leave the signal undefined — the Settings
 * page then shows "API version unavailable" — and never block bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class ApiVersionService {
  readonly version = signal<string | undefined>(undefined);

  capture(apiBaseUrl: string, fetchFn: typeof fetch = fetch): Promise<void> {
    return fetchFn(`${apiBaseUrl}/healthz`).then(
      async (res) => {
        const header = res.headers.get('X-Api-Version');
        this.version.set(header && header.length > 0 ? header : undefined);
      },
      () => undefined, // unreachable API: stays undefined, resolves, no retry
    );
  }
}
