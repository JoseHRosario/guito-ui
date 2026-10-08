import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryApi } from '../services/category-api';
import { ExpenseApi } from '../services/expense-api';
import { parseAmount, validateExpenseInput, type ExpenseFieldErrors } from '../services/validate-expense';
import type { ExtractedExpense } from '../services/ai-extract';

/** Local date as ISO yyyy-MM-dd (the date input's wire format). */
function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/** pt-PT decimal comma display for a prefilled amount (2.3 → '2,30'). */
function amountText(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

/** Fields the voice path may mark as AI suggested; keeps template lookups type-checked. */
export type VoiceField = 'amount' | 'date' | 'description' | 'category';

/** history.state payload left by the voice capture path (issue #44). */
export interface VoicePrefillState {
  voicePrefill: ExtractedExpense;
}

/** history.state payload left by the Bank accept path (issue #61). */
export interface BankPrefillState {
  bankPrefill: {
    description: string;
    /** Absolute positive amount from the bank row (guito-api#90 stores DBIT positive). */
    amount: number;
    /** ISO yyyy-MM-dd booking date. */
    date: string;
    /** Jev-suggested category name; '' when the API had no suggestion. */
    category: string;
  };
}

/**
 * Create Expense screen (issue #32): implements the approved Figma frame set
 * (mobile 3094:35, desktop 3094:9704, errors 3094:9937, save failure
 * 3094:10011). Success navigates back to the list with saved=1 (the list shows
 * the toast); failure keeps the user on the form with values intact.
 */
@Component({
  selector: 'g-create-expense-page',
  templateUrl: './create-expense-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
})
export class CreateExpensePage {
  private readonly categoryApi = inject(CategoryApi);
  private readonly expenseApi = inject(ExpenseApi);
  private readonly router = inject(Router);

  protected readonly categories = signal<readonly string[]>([]);
  protected readonly category = signal('');
  protected readonly amount = signal('');
  protected readonly description = signal('');
  /** ISO yyyy-MM-dd (daisyUI date input); defaults to today. */
  protected readonly isoDate = signal(todayIso());
  protected readonly errors = signal<ExpenseFieldErrors>({ amount: '', description: '', date: '', category: '' });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** AI proposal fields carry "AI suggested" markers until the user edits them (frame 3134:10053). */
  protected readonly voiceSuggested = signal<ReadonlySet<VoiceField>>(new Set());

  constructor() {
    // Voice capture (issue #44) lands here with history.state.voicePrefill;
    // the Bank accept path (issue #61) lands with history.state.bankPrefill.
    const state = this.router.getCurrentNavigation()?.extras?.state;
    const voice = state?.['voicePrefill'] as ExtractedExpense | undefined;
    const bank = state?.['bankPrefill'] as BankPrefillState['bankPrefill'] | undefined;
    const prefill: ExtractedExpense | undefined = voice ?? bank;
    void this.categoryApi.list().then(
      (names) => {
        this.categories.set(names);
        if (prefill) {
          // The AI-proposed category only preselects when the API offers it.
          const match = prefill.category ? names.find((name) => name.toLowerCase() === prefill.category.toLowerCase()) : undefined;
          if (bank && !bank.category) {
            // Issue #61: a bank row with no Jev suggestion starts the dropdown EMPTY —
            // the user picks manually (accept is never blocked).
            this.category.set('');
          } else {
            this.category.set(match ?? (names.length > 0 ? names[0] : ''));
            if (match) this.voiceSuggested.update((set) => new Set([...set, 'category' as VoiceField]));
          }
        } else if (names.length > 0) {
          this.category.set(names[0]);
        }
      },
      () => {
        /* category load failure: leave the select empty; validation flags it */
      },
    );
    if (prefill) {
      this.amount.set(amountText(prefill.amount));
      this.description.set(prefill.description);
      if (prefill.date) this.isoDate.set(prefill.date);
      // 'date' only when the proposal actually carried one (marker/value drift guard).
      // Bank-derived fields (issue #61) are bank data, not AI proposals — the markers
      // stay off; the Jev-suggested CATEGORY marker is set in the category branch above.
      if (!bank) {
        const fields: VoiceField[] = ['amount', 'description'];
        if (prefill.date) fields.push('date');
        this.voiceSuggested.set(new Set(fields));
      }
    }
  }

  /** daisyUI date input emits ISO yyyy-MM-dd directly ('' when cleared). */
  protected onDate(event: Event): void {
    this.isoDate.set((event.target as HTMLInputElement).value);
    this.clearSuggested('date');
  }

  protected onAmount(value: string): void {
    this.amount.set(value);
    this.clearSuggested('amount');
  }

  protected onDescription(value: string): void {
    this.description.set(value);
    this.clearSuggested('description');
  }

  protected onCategory(value: string): void {
    this.category.set(value);
    this.clearSuggested('category');
  }

  private clearSuggested(field: VoiceField): void {
    this.voiceSuggested.update((set) => {
      const next = new Set(set);
      next.delete(field);
      return next;
    });
  }

  protected save(): void {
    if (this.saving()) return;
    const validation = validateExpenseInput({
      amount: this.amount(),
      description: this.description(),
      date: this.isoDate(),
      category: this.category(),
    });
    const failed = Object.values(validation).some((message) => message !== '');
    this.errors.set(validation);
    this.saveError.set(null);
    if (failed) return;
    this.saving.set(true);
    const parsedAmount = parseAmount(this.amount());
    if (parsedAmount === null) return; // unreachable: validation gates above
    void this.expenseApi
      .create({
        date: this.isoDate(),
        // ADR 0010: amounts are stored positive — the outflow is implied by
        // the record being an Expense. Post the parsed amount as-is.
        amount: parsedAmount,
        description: this.description().trim(),
        category: this.category(),
      })
      .then(
        () => {
          void this.router.navigate(['/'], { queryParams: { saved: '1' } });
        },
        () => {
          this.saving.set(false);
          this.saveError.set('Could not save the expense');
        },
      );
  }
}
