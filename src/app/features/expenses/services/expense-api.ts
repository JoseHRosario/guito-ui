import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
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
