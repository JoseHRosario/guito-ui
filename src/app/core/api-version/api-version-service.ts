import { Injectable, signal } from '@angular/core';

/**
 * Holds the API build version (issue #51, guito-api#75). Captured ONCE at
 * bootstrap from the `X-Api-Version` response header of the single anonymous
 * `GET {apiBaseUrl}/warm` (issue #59, José review: one bootstrap call serves
 * warm-up AND version capture — every API response carries the header; the
 * body is never parsed, the value comes from the header alone).
 * The value answers "which API did this app session load against"; a reload
 * re-captures it. A failed warm call leaves the signal undefined — the
 * Settings page then shows "API version unavailable" — and never blocks
 * bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class ApiVersionService {
  readonly version = signal<string | undefined>(undefined);

  /** Reads X-Api-Version off the warm-up response; a missing header stays undefined. */
  captureFromResponse(res: Response): void {
    const header = res.headers.get('X-Api-Version');
    this.version.set(header && header.length > 0 ? header : undefined);
  }
}
