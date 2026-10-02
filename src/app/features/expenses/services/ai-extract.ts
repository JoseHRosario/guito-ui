import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/app-environment';

/** What `POST /AI/extract` returns (camelCase wire DTO `ExpenseExtracted`). */
export interface ExtractedExpense {
  /** ISO yyyy-MM-dd. */
  date: string;
  /** Positive (ADR 0010) — the outflow is implied by the record being an Expense. */
  amount: number;
  description: string;
  category: string;
}

interface ExtractedExpenseDto {
  date?: string | null;
  amount?: number | null;
  description?: string | null;
  category?: string | null;
}

/**
 * `POST /AI/extract` (guito-api#69): pt-PT transcript in, structured expense
 * proposal out. Transport-stubbed in tests (issue #44) — the endpoint itself is
 * a 501 stub until guito-api#69 lands; the UI contract is frozen here.
 */
@Injectable({ providedIn: 'root' })
export class AiExtractApi {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Resolves a reviewable proposal; rejects when the API fails or returns nothing usable. */
  async extract(prompt: string): Promise<ExtractedExpense> {
    const response = await firstValueFrom(
      this.http.post<ExtractedExpenseDto>(`${this.env.apiBaseUrl}/AI/extract`, {
        language: 'pt-PT',
        prompt,
      }),
    );
    const date = normalizeDate(response.date);
    const amount = response.amount ?? null;
    const description = (response.description ?? '').trim();
    const category = (response.category ?? '').trim();
    if (date === null || amount === null || amount <= 0 || description === '') {
      throw new Error('extract-unusable');
    }
    return { date, amount, description, category };
  }
}

/** ISO date part (yyyy-MM-dd) of the API's DateTime serialization; null when absent. */
function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return value.slice(0, 10);
}