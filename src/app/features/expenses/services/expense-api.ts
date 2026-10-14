import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import type { ExpenseDetail } from '../models/expense-detail';
import type { ExpenseUpdate } from '../models/expense-update';
import { knownOccurrence } from './expense-time';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import type { IconName } from '../../../shared/gicon';
import { occurrenceDay } from './expense-time';
import { amountDecimal } from './validate-expense';
import type { Expense } from '../models/expense';

/**
 * The Expense wire contract of `GET /Expense/latest/{count}` (ADR-0003 human
 * auth; the interceptor attaches the Bearer ID token). camelCase per the API's
 * System.Text.Json defaults; exact decimal strings preserve API precision.
 */
interface ExpenseDto {
  id?: number | string | null;
  bookingDate?: string | null;
  currency?: string | null;
  /** Pre-cutover date/numeric amount are accepted only at this HTTP boundary. */
  date?: string | null;
  amount?: string | number | null;
  description?: string | null;
  category?: string | null;
  creatorEmail?: string | null;
}

/** Integer expense IDs only; never derive identity from a sheet ordinal. */
function expenseId(value: number | string | null | undefined): number | null {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const id = typeof value === 'string' ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

/** Maps the API's category to its list-row lucide glyph; 'tag' fallback for unknown categories. */
function categoryIcon(category: string): IconName {
  const ICONS: Readonly<Record<string, IconName>> = {
    clothing: 'tag',
    broadband: 'wifi',
    shopping: 'shopping-bag',
    bills: 'zap',
    entertainment: 'film',
    snacks: 'utensils',
    health: 'heart',
  };
  return ICONS[category.toLowerCase()] ?? 'tag';
}

/** The latest-expenses list and create endpoints of the deployed API (guito-api#9, guito-ui#32). */
@Injectable({ providedIn: 'root' })
export class ExpenseApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Read authority on entry/reload; do not consult the cached list. */
  async detail(id: number): Promise<ExpenseDetail> {
    if (expenseId(id) !== id) throw new Error('expense-id-invalid');
    const response = await firstValueFrom(this.http.get<ExpenseDetail>(`${this.env.apiBaseUrl}/Expense/${id}`, {
      // The API response sets no-store; adding it to this request breaks CORS.
      observe: 'response',
    }).pipe(timeout(15000)));
    const dto = response.body;
    const etag = response.headers.get('ETag');
    if (response.status !== 200 || !dto || dto.id !== id || typeof dto.amount !== 'string' ||
        amountDecimal(dto.amount) === null || !knownOccurrence(dto.bookingDate) ||
        typeof dto.description !== 'string' || typeof dto.category !== 'string' || dto.currency !== 'EUR' ||
        typeof dto.revision !== 'string' || !/^[1-9]\d*$/.test(dto.revision) ||
        BigInt(dto.revision) > 9223372036854775807n || etag !== `"${dto.revision}"`) {
      throw new Error('expense-detail-invalid');
    }
    return { id: dto.id, amount: dto.amount, description: dto.description, category: dto.category,
      bookingDate: dto.bookingDate, currency: dto.currency, revision: dto.revision, etag };
  }

  /** Only a received PUT 200 acknowledges this write; no retry interceptor. */
  async update(id: number, etag: string, input: ExpenseUpdate): Promise<void> {
    this.requireRevision(id, etag);
    const response = await firstValueFrom(this.http.put(`${this.env.apiBaseUrl}/Expense/${id}`, {
      amount: input.amount, description: input.description, category: input.category,
      bookingDate: input.bookingDate, currency: input.currency,
    }, { observe: 'response', headers: { 'If-Match': etag } }).pipe(timeout(15000)));
    if (response.status !== 200) throw new Error('expense-write-unconfirmed');
  }

  async delete(id: number, etag: string): Promise<void> {
    this.requireRevision(id, etag);
    const response = await firstValueFrom(this.http.delete(`${this.env.apiBaseUrl}/Expense/${id}`, {
      observe: 'response', headers: { 'If-Match': etag },
    }).pipe(timeout(15000)));
    if (response.status !== 204) throw new Error('expense-write-unconfirmed');
  }

  private requireRevision(id: number, etag: string): void {
    if (expenseId(id) !== id) throw new Error('expense-id-invalid');
    if (!/^"[1-9]\d*"$/.test(etag) || BigInt(etag.slice(1, -1)) > 9223372036854775807n) {
      throw new Error('expense-revision-invalid');
    }
  }

  /** Latest expenses, newest first. `id` is the numeric Expense Id; pre-cutover missing identity stays null. */
  async latest(count = 20): Promise<Expense[]> {
    const url = `${this.env.apiBaseUrl}/Expense/latest/${count}`;
    const response = await firstValueFrom(this.http.get<{ expenses?: ExpenseDto[] | null }>(url));
    return (response.expenses ?? []).map((dto) => ({
      id: expenseId(dto.id),
      description: dto.description ?? '',
      amount: dto.amount == null ? null : amountDecimal(dto.amount),
      bookingDate: dto.bookingDate !== undefined ? dto.bookingDate : dto.date ?? null,
      category: dto.category ?? '',
      icon: categoryIcon(dto.category ?? ''),
    }));
  }

  /** Creates an expense (`POST /Expense`); resolves the numeric Expense Id, or null for a legacy nonnumeric ID. */
  async create(input: { date: string; currency?: 'EUR'; amount: number | string; description: string; category: string }): Promise<number | null> {
    // Central gate covers all callers, including favorites; Sheets rejects timestamps.
    const amount = amountDecimal(input.amount);
    if (amount === null) throw new Error('expense-amount-invalid');
    const timestampsEnabled = this.env.expenseTimestampsEnabled === true;
    const body = {
      // New API requires bookingDate; production Sheets keeps date until coordinated cutover.
      [timestampsEnabled ? 'bookingDate' : 'date']: timestampsEnabled ? input.date : occurrenceDay(input.date),
      amount,
      description: input.description,
      category: input.category,
      ...(timestampsEnabled && input.currency ? { currency: input.currency } : {}),
    };
    const response = await firstValueFrom(
      this.http.post<{ id?: string | number | null }>(`${this.env.apiBaseUrl}/Expense`, body),
    );
    // Legacy nonnumeric create IDs indicate success but cannot become numeric identity.
    return expenseId(response.id);
  }
}
