import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryApi } from '../services/category-api';
import { ExpenseApi } from '../services/expense-api';
import { parseAmount, validateExpenseInput, type ExpenseFieldErrors } from '../services/validate-expense';

/** Local date as ISO yyyy-MM-dd (the date input's wire format). */
function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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

  constructor() {
    void this.categoryApi.list().then(
      (names) => {
        this.categories.set(names);
        if (names.length > 0) this.category.set(names[0]);
      },
      () => {
        /* category load failure: leave the select empty; validation flags it */
      },
    );
  }

  /** daisyUI date input emits ISO yyyy-MM-dd directly ('' when cleared). */
  protected onDate(event: Event): void {
    this.isoDate.set((event.target as HTMLInputElement).value);
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
