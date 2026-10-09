import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { BankApi } from '../../bank/services/bank-api';
import type { BankConnection } from '../../bank/models/bank-connection';

/** Shown before the accounts load (and when none carry an expiry date). */
const GENERIC_EXPIRY_NOTE = 'Consent expires 90–180 days after linking — re-link from here.';

/**
 * Bank connection card of the Settings page (approved frame
 * 'Settings — Bank connection (Mobile)' 3211:9936, issue #64).
 * All consent and bank linking lives HERE — the Bank page only routes back.
 * 'Link your bank' fetches the EB consent URL (GET /BankAuth/url) and hands
 * the whole browser tab to it; the API's public callback 302s back to
 * `/bank?linked=N` (guito-api#117). Re-linking runs the same flow and upserts
 * in place.
 */
@Component({
  selector: 'g-bank-connection-card',
  templateUrl: './bank-connection-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankConnectionCard {
  private readonly bankApi = inject(BankApi);
  private readonly env = inject(APP_ENVIRONMENT);

  /** The hardcoded MVP bank + country word (env-driven; prod fallback pair). */
  protected readonly bankName = this.env.bankName ?? 'Activo Bank';
  protected readonly bankCountryLabel = this.env.bankCountryLabel ?? 'Portugal';

  /** null = still loading; [] = no bank connected; else the linked accounts. */
  protected readonly accounts = signal<readonly BankConnection[] | null>(null);
  protected readonly loadFailed = signal(false);
  /** The consent-URL request is in flight: button disabled + spinner. */
  protected readonly linking = signal(false);
  protected readonly linkFailed = signal(false);

  /**
   * Redirection seam for tests (jsdom forbids spying on location.assign).
   * A full-tab redirect, not router.navigate: the consent screen is on
   * Enable Banking's domain.
   */
  protected readonly go: (url: string) => void = (url) => window.location.assign(url);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.accounts.set(await this.bankApi.connections());
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected async link(): Promise<void> {
    if (this.linking()) return;
    this.linking.set(true);
    this.linkFailed.set(false);
    try {
      const url = await this.bankApi.authUrl();
      this.go(url);
    } catch {
      this.linkFailed.set(true);
    } finally {
      this.linking.set(false);
    }
  }

  /** Expiry note; dd/mm/yyyy like every other date in the app. Expired consent gets its own line. */
  protected expiryNote(): string {
    const accounts = this.accounts();
    if (accounts === null) return GENERIC_EXPIRY_NOTE;
    const now = Date.now();
    const expired = accounts.some(
      (a) =>
        a.consentStatus.toUpperCase() === 'EXPIRED' ||
        (a.consentExpiresAt !== null && a.consentExpiresAt !== '' && Date.parse(a.consentExpiresAt) < now),
    );
    if (expired) return 'Consent expired — link your bank again.';
    const iso = accounts
      .map((a) => a.consentExpiresAt)
      .filter((v): v is string => v !== null && v !== '')
      .sort()
      .at(-1);
    if (iso === undefined) return GENERIC_EXPIRY_NOTE;
    const d = new Date(iso);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return `Consent expires ${date} — re-link from here.`;
  }
}
