import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import type { IconName } from '../../../shared/gicon';
import type { Expense } from '../models/expense';

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

  /** Creates an expense (`POST /Expense`); resolves the opaque Expense Id (ADR-0009). */
  async create(input: { date: string; amount: number; description: string; category: string }): Promise<number> {
    const response = await firstValueFrom(
      this.http.post<{ id?: number | null }>(`${this.env.apiBaseUrl}/Expense`, input),
    );
    return response.id ?? 0;
  }
}
