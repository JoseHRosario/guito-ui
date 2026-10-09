import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import type { BankConnection } from '../models/bank-connection';
import type { BankSyncResult, BankTransaction } from '../models/bank-transaction';

/** Wire shape of one linked account (guito-api#117): camelCase, tolerant mapping. */
interface BankConnectionDto {
  name?: string | null;
  ibanMasked?: string | null;
  currency?: string | null;
  aspspName?: string | null;
  aspspCountry?: string | null;
  consentStatus?: string | null;
  consentExpiresAt?: string | null;
}

/**
 * Wire shape of the pending bank-transaction rows (guito-api#91/#112).
 * camelCase per the API's System.Text.Json defaults; nullable fields mirror
 * the Postgres-backed rows. This is the UI's provisional contract — the
 * endpoint is not implemented yet (tracked in guito-api#91).
 */
interface BankTransactionDto {
  id?: number | string | null;
  bookingDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  remittanceInformation?: string | null;
  /** FK id of the Jev-suggested category (guito-api#112). */
  suggestedCategoryId?: number | string | null;
  /** Category NAME resolved from the categories mirror table (guito-api#112). */
  suggestedCategory?: string | null;
}

/** Pending list + sync endpoints of the bank feature (guito-api#90/#91, guito-ui#61). */
@Injectable({ providedIn: 'root' })
export class BankApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Pending (unmatched) bank transactions, oldest booking first per the API. */
  async pending(): Promise<BankTransaction[]> {
    const response = await firstValueFrom(this.http.get<BankTransactionDto[]>(`${this.env.apiBaseUrl}/BankTransaction`));
    return (response ?? [])
      .filter((dto): dto is BankTransactionDto => dto !== null && typeof dto === 'object')
      .map((dto) => ({
        id: dto.id === null || dto.id === undefined ? '' : String(dto.id),
        date: dto.bookingDate ?? '',
        amount: dto.amount ?? 0,
        currency: dto.currency ?? 'EUR',
        description: dto.remittanceInformation ?? '',
        suggestedCategory:
          dto.suggestedCategoryId !== null && dto.suggestedCategoryId !== undefined && dto.suggestedCategory
            ? { id: String(dto.suggestedCategoryId), name: dto.suggestedCategory }
            : null,
      }));
  }

  /** Triggers a sync against Enable Banking; resolves `{fetched, new}` (guito-api#90). */
  async sync(): Promise<BankSyncResult> {
    const response = await firstValueFrom(
      this.http.post<{ fetched?: number | null; new?: number | null }>(`${this.env.apiBaseUrl}/BankTransaction/sync`, {}),
    );
    return { fetched: response.fetched ?? 0, new: response.new ?? 0 };
  }

  /** Linked accounts for the Settings bank-connection card (guito-api#117); empty = no bank connected. */
  async connections(): Promise<BankConnection[]> {
    const response = await firstValueFrom(
      this.http.get<{ accounts?: (BankConnectionDto | null)[] | null }>(`${this.env.apiBaseUrl}/BankConnection`),
    );
    return (response?.accounts ?? [])
      .filter((dto): dto is BankConnectionDto => dto !== null && typeof dto === 'object')
      .map((dto) => ({
        name: dto.name ?? '',
        ibanMasked: dto.ibanMasked ?? '',
        currency: dto.currency ?? '',
        aspspName: dto.aspspName ?? '',
        aspspCountry: dto.aspspCountry ?? '',
        consentStatus: dto.consentStatus ?? '',
        consentExpiresAt: dto.consentExpiresAt ?? null,
      }));
  }

  /**
   * The Enable Banking consent URL for the link flow (issue #64, guito-api#89):
   * one hardcoded bank per environment (guito-api#116 out of scope: ASPSP list
   * proxy) — sandbox 'Nordea'/FI, production 'Activo Bank'/PT. EB rejects
   * unknown names with 422 "Wrong ASPSP name provided", so the name must match
   * the application's /aspsps list exactly.
   * Resolves the `{url}` payload; an empty URL cannot redirect, so it rejects.
   */
  async authUrl(): Promise<string> {
    const aspsp = this.env.bankName ?? 'Activo Bank';
    const country = this.env.bankCountry ?? 'PT';
    const params = `aspsp=${encodeURIComponent(aspsp)}&country=${encodeURIComponent(country)}`;
    const response = await firstValueFrom(
      this.http.get<{ url?: string | null }>(`${this.env.apiBaseUrl}/BankAuth/url?${params}`),
    );
    const url = response?.url ?? '';
    if (!url) throw new Error('BankAuth/url returned no consent URL');
    return url;
  }
}