import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { amountDecimal } from '../../expenses/services/validate-expense';
import type { CreateAndMatchInput } from '../models/create-and-match-input';
import type { BankConnection } from '../models/bank-connection';
import type { BankTransaction } from '../models/bank-transaction';
import type { LinkedExpense } from '../models/linked-expense';
import type { BankSyncResult } from '../models/bank-sync-result';
import type { BankReviewStatus } from '../models/bank-review-status';
import type { BankConnectionDto } from '../models/bank-connection-dto';
import type { BankTransactionDto } from '../models/bank-transaction-dto';

export function validBankId(id: unknown): id is string {
  return typeof id === 'string' && /^[1-9]\d*$/.test(id) && BigInt(id) <= 9223372036854775807n;
}
/** Read unsafe numeric IDs from their original JSON tokens, before Number can round them. */
function bankJson<T>(body: string): T {
  return JSON.parse(body, (key: string, value: unknown, context?: { source?: string }) => {
    if (key !== 'id' || typeof value !== 'number' || Number.isSafeInteger(value)) return value;
    if (context?.source && /^[1-9]\d*$/.test(context.source)) return context.source;
    // Older engines without reviver source must never target a rounded financial identity.
    throw new Error('This browser cannot preserve the Bank Transaction identity. Update your browser.');
  }) as T;
}

/** Only a complete existing linked Expense can establish current matched state. */
function validLinkedExpense(value: unknown): value is LinkedExpense {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expense = value as Record<string, unknown>;
  return typeof expense['id'] === 'number' && Number.isSafeInteger(expense['id']) &&
    expense['id'] > 0 && expense['id'] <= 2147483647 &&
    typeof expense['bookingDate'] === 'string' && Number.isFinite(Date.parse(expense['bookingDate'])) &&
    (typeof expense['amount'] === 'string' || typeof expense['amount'] === 'number') && amountDecimal(expense['amount']) !== null &&
    typeof expense['currency'] === 'string' && /^[A-Z]{3}$/.test(expense['currency']) &&
    typeof expense['description'] === 'string' && typeof expense['category'] === 'string';
}

function transaction(dto: BankTransactionDto): BankTransaction {
  return {
    id: String(dto.id),
    accountUid: dto.accountUid ?? '',
    date: dto.bookingDate ?? '',
    amount: amountDecimal(dto.amount ?? '') ?? '',
    currency: dto.currency ?? 'EUR',
    description: dto.remittanceInformation ?? '',
    status: dto.status ?? '',
    reviewStatus: dto.reviewStatus ?? 'needsReview',
    suggestedExpenseCount: dto.suggestedExpenseCount ?? 0,
    suggestedCategory: dto.suggestedCategory ? { id: String(dto.suggestedCategory.id), name: dto.suggestedCategory.name } : null,
    linkedExpense: validLinkedExpense(dto.linkedExpense) ? { ...dto.linkedExpense, amount: amountDecimal(dto.linkedExpense.amount) ?? '' } : null,
  };
}

@Injectable({ providedIn: 'root' })
export class BankApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Bare array, all states by default. Filtering is optional at the HTTP seam. */
  async list(reviewStatus?: BankReviewStatus | 'all'): Promise<BankTransaction[]> {
    const body = await firstValueFrom(this.http.get(`${this.env.apiBaseUrl}/BankTransaction`, {
      params: reviewStatus ? { reviewStatus } : {}, responseType: 'text',
    }).pipe(timeout(15000)));
    const response = bankJson<BankTransactionDto[]>(body);
    return (response ?? [])
      .filter(dto => dto !== null && typeof dto === 'object' && dto.id !== null && dto.id !== undefined && String(dto.id) !== '')
      .map(transaction);
  }

  private readonly creating = new Set<string>();
  isCreating(id: string): boolean { return this.creating.has(id); }

  async createAndMatch(id: string, input: CreateAndMatchInput): Promise<BankTransaction> {
    if (!validBankId(id)) throw new Error('create-context-invalid');
    if (this.creating.has(id)) throw new Error('create-in-flight');
    this.creating.add(id);
    try {
      const response = await firstValueFrom(this.http.post(
        `${this.env.apiBaseUrl}/BankTransaction/${id}/create-and-match`, input,
        { responseType: 'text', observe: 'response' },
      ).pipe(timeout(15000)));
      const dto = bankJson<BankTransactionDto>(response.body ?? 'null');
      if (response.status !== 200 || !dto || String(dto.id) !== id || dto.reviewStatus !== 'matched' || !validLinkedExpense(dto.linkedExpense)) throw new Error('create-response-invalid');
      return transaction(dto);
    } finally { this.creating.delete(id); }
  }

  async suggestions(id: string): Promise<LinkedExpense[]> {
    return firstValueFrom(this.http.get<LinkedExpense[]>(
      `${this.env.apiBaseUrl}/BankTransaction/${encodeURIComponent(id)}/suggestions`,
    ));
  }

  async match(id: string, expenseId: number): Promise<BankTransaction> { return this.link(id, expenseId, 'match'); }
  async unmatch(id: string, expenseId: number): Promise<BankTransaction> { return this.link(id, expenseId, 'unmatch'); }
  private async link(id: string, expenseId: number, action: 'match' | 'unmatch'): Promise<BankTransaction> {
    if (!Number.isInteger(expenseId) || expenseId < 1 || expenseId > 2147483647) throw new Error('expense-id-invalid');
    const body = await firstValueFrom(this.http.post(
      `${this.env.apiBaseUrl}/BankTransaction/${encodeURIComponent(id)}/${action}`, { expenseId }, { responseType: 'text' },
    ));
    return transaction(bankJson<BankTransactionDto>(body));
  }

  async ignore(id: string): Promise<BankTransaction> { return this.transition(id, 'ignore'); }
  async review(id: string): Promise<BankTransaction> { return this.transition(id, 'review'); }
  private async transition(id: string, action: 'ignore' | 'review'): Promise<BankTransaction> {
    const body = await firstValueFrom(this.http.post(
      `${this.env.apiBaseUrl}/BankTransaction/${encodeURIComponent(id)}/${action}`, {}, { responseType: 'text' },
    ));
    return transaction(bankJson<BankTransactionDto>(body));
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
