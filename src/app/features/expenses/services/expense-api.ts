import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import type { Expense } from '../models/expense';
import { categoryIcon } from '../../../core/category-icon';

/**
 * The Expense wire contract of `GET /Expense/latest/{count}` (ADR-0003 human
 * auth; the interceptor attaches the Bearer ID token). camelCase per the API's
 * System.Text.Json defaults; nullable fields mirror the sheet-backed DTO.
 */
interface ExpenseDto {
  storedOrder?: number | null;
  date?: string | null;
  amount?: number | null;
  description?: string | null;
  category?: string | null;
  creatorEmail?: string | null;
}

/** The deployed API's latest-expenses list (guito-api#9). */
@Injectable({ providedIn: 'root' })
export class ExpenseApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Latest expenses, newest first. `id` is the opaque Expense Id (ADR-0009). */
  async latest(count = 20): Promise<Expense[]> {
    const url = `${this.env.apiBaseUrl}/Expense/latest/${count}`;
    const response = await firstValueFrom(this.http.get<{ expenses?: ExpenseDto[] | null }>(url));
    return (response.expenses ?? []).map((dto) => ({
      id: String(dto.storedOrder ?? ''),
      description: dto.description ?? '',
      amount: dto.amount ?? 0,
      date: dto.date ?? '',
      category: dto.category ?? '',
      icon: categoryIcon(dto.category ?? ''),
    }));
  }
}