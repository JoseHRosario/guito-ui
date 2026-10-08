import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import type { BankSyncResult, BankTransaction } from '../models/bank-transaction';

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
        suggestedCategory: dto.suggestedCategory ?? null,
      }));
  }

  /** Triggers a sync against Enable Banking; resolves `{fetched, new}` (guito-api#90). */
  async sync(): Promise<BankSyncResult> {
    const response = await firstValueFrom(
      this.http.post<{ fetched?: number | null; new?: number | null }>(`${this.env.apiBaseUrl}/BankTransaction/sync`, {}),
    );
    return { fetched: response.fetched ?? 0, new: response.new ?? 0 };
  }
}