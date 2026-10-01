import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryApi } from '../services/category-api';
import { ExpenseApi } from '../services/expense-api';
import { parseAmount, validateExpenseInput, type ExpenseFieldErrors } from '../services/validate-expense';

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
  protected readonly day = signal('');
  protected readonly month = signal('');
  protected readonly year = signal('');
  protected readonly errors = signal<ExpenseFieldErrors>({ amount: '', description: '', date: '', category: '' });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** dd/mm/yyyy → ISO yyyy-MM-dd; '' while segments are incomplete. */
  protected readonly isoDate = computed(() => {
    const d = this.day().padStart(2, '0');
    const m = this.month().padStart(2, '0');
    const y = this.year();
    return /^\d{2}$/.test(d) && /^\d{2}$/.test(m) && /^\d{4}$/.test(y) ? `${y}-${m}-${d}` : '';
  });

  constructor() {
    const today = new Date();
    this.day.set(String(today.getDate()).padStart(2, '0'));
    this.month.set(String(today.getMonth() + 1).padStart(2, '0'));
    this.year.set(String(today.getFullYear()));
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

  /** Segment inputs carry digits only (frame: dd/mm/yyyy three-segment control).
   * Deliberate DOM write-back: sanitizing the input in place (no state bypass). */
  protected onDateSegment(segment: 'day' | 'month' | 'year', event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, segment === 'year' ? 4 : 2);
    input.value = digits;
    this[segment].set(digits);
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
        // Expenses are outflows: the API stores Amount verbatim and the list
        // renders it verbatim, so post the negative (approved list convention).
        amount: -parsedAmount,
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
