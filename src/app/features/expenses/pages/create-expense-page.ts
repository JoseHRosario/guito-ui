import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import type { CreateAndMatchInput } from '../../bank/models/create-and-match-input';
import type { BankCreateContext } from '../../bank/models/bank-create-context';
import { BankApi, validBankId } from '../../bank/services/bank-api';
import { readBankCreate, storeBankCreate } from '../../bank/services/bank-create-context';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { CategoryApi } from '../services/category-api';
import { ExpenseApi } from '../services/expense-api';
import { amountDecimal, parseAmount, validateExpenseInput, type ExpenseFieldErrors } from '../services/validate-expense';
import type { ExtractedExpense } from '../services/ai-extract';
import { knownOccurrence, lisbonFields, lisbonNow, resolveOccurrence } from '../services/expense-time';

/** pt-PT decimal comma display for a prefilled amount (2.3 → '2,30'). */
function amountText(amount: number | string): string {
  const exact = amountDecimal(amount);
  if (exact === null) return '';
  const [whole, fraction = ''] = exact.split('.');
  return `${whole},${fraction.padEnd(2, '0')}`;
}

/** Fields the voice path may mark as AI suggested; keeps template lookups type-checked. */
export type VoiceField = 'amount' | 'date' | 'description' | 'category';

/** history.state payload left by the voice capture path (issue #44). */
export interface VoicePrefillState {
  voicePrefill: ExtractedExpense;
}

/** Bank-origin prefill; exact persisted identity also travels in query context (#135). */
export interface BankPrefillState {
  bankPrefill: {
    transactionId: string;
    description: string;
    /** Bank amount as supplied; preserve its sign without inferring outflow semantics. */
    amount: string;
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
  protected readonly timestampsEnabled = inject(APP_ENVIRONMENT).expenseTimestampsEnabled === true;
  private readonly categoryApi = inject(CategoryApi);
  private readonly expenseApi = inject(ExpenseApi);
  private readonly router = inject(Router);

  private readonly bankApi = inject(BankApi);
  private readonly route = inject(ActivatedRoute);
  private bankContext: BankCreateContext | null = null;
  protected readonly bankMode = signal(false);
  protected readonly uncertain = signal(false);
  protected readonly blocked = signal(false);
  protected readonly locked = computed(() => this.saving() || this.uncertain() || this.blocked());
  canLeave(): boolean { return !this.bankMode() || !this.saving(); }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.canLeave()) { event.preventDefault(); event.returnValue = ''; }
  }
  protected cancel(): void { if (this.canLeave()) void this.router.navigate([this.bankMode() ? '/bank' : '/']); }

  protected readonly categories = signal<readonly string[]>([]);
  protected readonly category = signal('');
  protected readonly amount = signal('');
  protected readonly description = signal('');
  /** ISO yyyy-MM-dd (daisyUI date input); defaults to today. */
  private readonly initialOccurrence = lisbonNow();
  private knownInstant: string | null = this.initialOccurrence.occurredAt;
  protected readonly isoDate = signal(this.initialOccurrence.date);
  protected readonly time = signal(this.initialOccurrence.time);
  protected readonly timeError = signal('');
  protected readonly errors = signal<ExpenseFieldErrors>({ amount: '', description: '', date: '', category: '' });
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** AI proposal fields carry "AI suggested" markers until the user edits them (frame 3134:10053). */
  protected readonly voiceSuggested = signal<ReadonlySet<VoiceField>>(new Set());

  constructor() {
    // Voice capture (issue #44) lands here with history.state.voicePrefill;
    // Bank creation (#135) retains exact identity and prefill through reload.
    const state = this.router.getCurrentNavigation()?.extras?.state;
    const voice = state?.['voicePrefill'] as ExtractedExpense | undefined;
    let bank = state?.['bankPrefill'] as BankCreateContext['prefill'] | undefined;
    const id = this.route.snapshot.queryParamMap.get('bankTransactionId');
    if (id !== null || bank) {
      this.bankMode.set(true);
      try {
        if (!validBankId(id)) throw new Error('bank-context-missing');
        if (bank) {
          const supplied = state?.['bankPrefill'] as { transactionId?: string };
          if (supplied.transactionId !== id) throw new Error('bank-context-mismatch');
          // Browser history must not clear the submitted marker.
          if (sessionStorage.getItem(`guito.bank-create.${id}`) === null) storeBankCreate({ transactionId: id, prefill: bank });
        }
        this.bankContext = readBankCreate(id);
        bank = this.bankContext.prefill;
        if (this.bankContext.submitted || state?.['bankCreateSubmitted'] === id) {
          this.uncertain.set(true);
          void this.checkBankState();
        }
      } catch {
        bank = undefined;
        this.blocked.set(true);
        this.saveError.set('Bank recovery data is unavailable or invalid. Return to Bank; saving is blocked.');
      }
    }
    const prefill: ExtractedExpense | undefined = this.bankMode() ? bank : voice;
    void this.categoryApi.list().then(
      (names) => {
        this.categories.set(names);
        if (prefill) {
          // The AI-proposed category only preselects when the API offers it.
          const match = prefill.category ? names.find((name) => name.toLowerCase() === prefill.category.toLowerCase()) : undefined;
          if (bank && !bank.category) {
            // A bank row without a category suggestion starts empty for manual choice.
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
      const known = knownOccurrence(prefill.date);
      if (known) {
        const fields = lisbonFields(new Date(known));
        this.isoDate.set(fields.date);
        this.time.set(fields.time);
        this.knownInstant = known;
      } else if (prefill.date) {
        this.isoDate.set(prefill.date);
        this.knownInstant = null;
      }
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
    this.knownInstant = null;
    this.clearSuggested('date');
  }

  protected onTime(value: string): void {
    this.time.set(value);
    this.knownInstant = null;
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
    if (this.locked()) return;
    const validation = validateExpenseInput({
      amount: this.amount(),
      description: this.description(),
      date: this.isoDate(),
      category: this.category(),
    });
    const occurrence = this.timestampsEnabled ? resolveOccurrence(this.isoDate(), this.time(), this.knownInstant) : { occurredAt: null, error: '' };
    this.timeError.set(occurrence.error);
    const failed = Object.values(validation).some((message) => message !== '') || (this.timestampsEnabled && occurrence.occurredAt === null);
    this.errors.set(validation);
    this.saveError.set(null);
    if (failed) return;
    this.saving.set(true);
    const parsedAmount = parseAmount(this.amount());
    if (parsedAmount === null) return; // unreachable: validation gates above
    const input = {
      date: this.timestampsEnabled ? occurrence.occurredAt! : this.isoDate(),
      ...(this.timestampsEnabled ? { currency: 'EUR' as const } : {}),
      // Preserve the supplied signed/zero decimal exactly; never infer a sign.
      amount: parsedAmount,
      description: this.description().trim(),
      category: this.category(),
    };
    if (this.bankMode()) {
      void this.saveBank({ bookingDate: input.date, currency: 'EUR', amount: parsedAmount, description: input.description, category: input.category });
      return;
    }
    void this.expenseApi.create(input).then(
      () => {
        void this.router.navigate(['/'], { queryParams: { saved: '1' } });
      },
      () => {
        this.saving.set(false);
        this.saveError.set('Could not save the expense');
      },
    );
  }
  private async saveBank(input: CreateAndMatchInput): Promise<void> {
    const context = this.bankContext;
    if (!context) { this.saving.set(false); return; }
    try {
      if (readBankCreate(context.transactionId).submitted || this.bankApi.isCreating(context.transactionId)) throw new Error('already-submitted');
      storeBankCreate({ ...context, submitted: true });
      history.replaceState({ ...history.state, bankCreateSubmitted: context.transactionId }, '');
    } catch {
      this.blocked.set(true); this.saving.set(false);
      this.saveError.set('Could not verify Bank context. Saving is blocked. Return to Bank.'); return;
    }
    try {
      await this.bankApi.createAndMatch(context.transactionId, input);
      this.saving.set(false);
      this.blocked.set(true);
      await this.router.navigate(['/bank']);
    } catch (error) {
      if (error instanceof HttpErrorResponse && [400, 401, 403, 404, 409, 422].includes(error.status)) {
        try {
          storeBankCreate(context);
          history.replaceState({ ...history.state, bankCreateSubmitted: undefined }, '');
        } catch { this.blocked.set(true); }
        if ([404, 409].includes(error.status)) this.blocked.set(true);
        const messages: Record<number, string> = { 400: 'Check the expense values and try again.', 401: 'Sign in to continue.', 403: 'You cannot save this expense.', 404: 'Bank transaction is missing. Return to Bank.', 409: 'Bank transaction changed. Return to Bank to review.', 422: 'Category is unavailable. Choose a current category.' };
        this.saveError.set(messages[error.status]);
        if (error.status === 422) void this.categoryApi.list().then(names => this.categories.set(names), () => {});
      } else {
        this.uncertain.set(true);
        await this.readBankState();
      }
    } finally { this.saving.set(false); }
  }
  protected async checkBankState(): Promise<void> {
    if (this.saving()) return;
    await this.readBankState();
  }
  private async readBankState(): Promise<void> {
    if (!this.bankContext) return;
    this.saving.set(true);
    this.saveError.set('Outcome unknown. Check again or Return to Bank. Review the current Bank and start a fresh Create before saving again.');
    try {
      const current = (await this.bankApi.list()).find(row => row.id === this.bankContext?.transactionId);
      if (current?.reviewStatus === 'matched' && current.linkedExpense) {
        // Current link state does not establish whether this Save succeeded.
        this.saving.set(false);
        this.blocked.set(true);
        await this.router.navigate(['/bank']);
      }
    } catch { /* Failed reads retain the form and uncertainty; they never authorize a write. */ }
    finally { this.saving.set(false); }
  }
}
