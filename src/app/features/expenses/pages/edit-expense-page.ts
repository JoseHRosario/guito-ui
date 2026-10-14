import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, afterRenderEffect, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ExpenseApi } from '../services/expense-api';
import { CategoryApi } from '../services/category-api';
import type { ExpenseDetail } from '../models/expense-detail';
import type { ExpenseUpdate } from '../models/expense-update';
import { parseAmount } from '../services/validate-expense';
import { lisbonFields, occurrenceDay, resolveOccurrence } from '../services/expense-time';

@Component({
  selector: 'g-edit-expense-page',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  templateUrl: './edit-expense-page.html',
  imports: [NgTemplateOutlet],
  styles: ['dialog::backdrop { background: color-mix(in srgb, var(--color-base-content) 25%, transparent); }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditExpensePage {
  private readonly api = inject(ExpenseApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly categoryApi = inject(CategoryApi);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  private readSequence = 0;
  protected readonly loaded = signal<ExpenseDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly recovery = signal<'ready' | 'stale' | 'checking' | 'found' | 'check-failed' | 'absent' | 'unavailable'>('ready');
  protected readonly amount = signal('');
  protected readonly description = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly category = signal('');
  protected readonly categories = signal<readonly string[]>([]);
  protected readonly message = signal('');
  protected readonly errors = signal({ amount: '', date: '', time: '', category: '' });
  protected readonly modal = signal<'discard' | 'delete' | 'reload' | 'recovery' | null>(null);
  protected readonly recoveryTitle = computed(() => ({
    ready: '', stale: 'Expense changed', checking: 'Checking current expense…', found: 'Review current expense',
    'check-failed': 'Could not check outcome', absent: 'Expense is now absent', unavailable: 'Expense unavailable',
  })[this.recovery()]);
  private departure: ((value: boolean) => void) | null = null;
  private allowDeparture = false;
  private readonly document = inject(DOCUMENT);
  /** Retained separately from readback: current values never acknowledge this intent. */
  private attempted: { operation: 'update' | 'delete'; id: number; etag: string; body?: ExpenseUpdate } | null = null;
  protected readonly current = signal<ExpenseDetail | null>(null);
  private originalFields = '';
  private originalOccurrenceFields = '';
  private knownInstant: string | null = null;
  private id: number | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; this.departure?.(false); });
    afterRenderEffect(() => {
      const kind = this.modal();
      this.recovery();
      const dialog = this.document.querySelector<HTMLDialogElement>('g-edit-expense-page dialog');
      if (!dialog) return;
      if (kind && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
      if (kind && dialog.open && (this.document.activeElement === dialog || !dialog.contains(this.document.activeElement))) {
        (dialog.querySelector<HTMLButtonElement>('button[autofocus]') ?? dialog).focus();
      }
      if (!kind && dialog.open) dialog.close();
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const text = params.get('id') ?? '';
      this.id = /^\d+$/.test(text) && Number(text) > 0 && Number(text) <= 2147483647 ? Number(text) : null;
      this.loaded.set(null);
      this.allowDeparture = false;
      void this.read();
    });
    void this.loadCategories();
  }

  private async loadCategories(): Promise<void> {
    try {
      const names = await this.categoryApi.list();
      if (!this.destroyed) this.categories.set(names);
    } catch {
      if (!this.destroyed) this.message.set('Could not load categories. Try reading again. Your edits are retained.');
    }
  }

  protected async read(): Promise<void> {
    const sequence = ++this.readSequence;
    this.loading.set(true);
    this.message.set('');
    if (this.id === null) {
      this.loading.set(false); this.message.set('Invalid expense ID. Back to expenses.'); return;
    }
    try {
      const detail = await this.api.detail(this.id);
      if (this.destroyed || sequence !== this.readSequence) return;
      this.errors.set({ amount: '', date: '', time: '', category: '' });
      this.recovery.set('ready');
      this.attempted = null;
      this.current.set(null);
      this.loaded.set(detail);
      this.amount.set(detail.amount.replace('.', ','));
      this.description.set(detail.description);
      this.category.set(detail.category);
      const fields = lisbonFields(new Date(detail.bookingDate));
      this.date.set(fields.date);
      // Minute-only native picker; exact seconds/fraction/offset stay independent.
      this.time.set(fields.time);
      this.originalOccurrenceFields = `${this.date()}|${this.time()}`;
      this.knownInstant = detail.bookingDate;
      this.originalFields = this.fields();
    } catch (error: unknown) {
      if (this.destroyed || sequence !== this.readSequence) return;
      if (error instanceof HttpErrorResponse && error.status === 404) this.unavailable();
      else this.message.set('Could not load expense. Try reading again.');
    } finally { if (!this.destroyed && sequence === this.readSequence) this.loading.set(false); }
  }

  private fields(): string {
    return JSON.stringify([this.amount(), this.description(), this.date(), this.time(), this.category()]);
  }

  protected change(field: 'amount' | 'description' | 'date' | 'time' | 'category', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this[field].set(field === 'time' && /^\d{2}:\d{2}:00$/.test(value) ? value.slice(0, 5) : value);
    if (field === 'date' || field === 'time') {
      this.knownInstant = `${this.date()}|${this.time()}` === this.originalOccurrenceFields ? this.loaded()?.bookingDate ?? null : null;
    }
  }

  protected async save(): Promise<void> {
    const detail = this.loaded();
    if (!detail || this.loading() || this.busy() || this.recovery() !== 'ready') return;
    const parsed = parseAmount(this.amount());
    const occurrence = resolveOccurrence(this.date(), this.time().slice(0, 5), this.knownInstant);
    if (!/^\d{2}:\d{2}$/.test(this.time())) {
      occurrence.occurredAt = null;
      occurrence.error = 'Enter a valid time';
    } else if (occurrence.occurredAt && !this.knownInstant) {
      // Date-only edits retain hidden precision, but resolve the new Lisbon offset.
      // An actual minute edit starts at :00, without an inherited fraction.
      const originalTime = this.originalOccurrenceFields.split('|')[1];
      const unchangedTime = this.time() === originalTime;
      const seconds = unchangedTime ? detail.bookingDate.slice(17, 19) : '00';
      const fraction = unchangedTime ? detail.bookingDate.match(/\.(\d+)/)?.[1] : undefined;
      occurrence.occurredAt = occurrence.occurredAt.replace(/:00([+-]\d{2}:\d{2})$/, `:${seconds}${fraction ? '.' + fraction : ''}$1`);
    }
    const errors = {
      amount: parsed === null ? 'Enter a valid decimal amount' : '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(this.date()) ? '' : 'Enter a valid date',
      time: occurrence.error,
      category: this.category().trim() ? '' : 'Select a category',
    };
    this.errors.set(errors);
    this.message.set('');
    if (Object.values(errors).some(Boolean) || parsed === null || !occurrence.occurredAt) return;
    const body: ExpenseUpdate = {
      amount: this.amount() === detail.amount.replace('.', ',') ? detail.amount : parsed,
      description: this.description(), category: this.category(), bookingDate: occurrence.occurredAt, currency: 'EUR',
    };
    this.attempted = { operation: 'update', id: detail.id, etag: detail.etag, body };
    this.busy.set(true);
    try {
      await this.api.update(detail.id, detail.etag, body);
      this.allowDeparture = true;
      await this.router.navigate(['/'], { queryParams: { updated: '1' } });
    } catch (error: unknown) { await this.writeFailed(error); }
    finally { this.busy.set(false); }
  }

  protected confirmDelete(): void {
    if (this.loaded() && !this.busy() && !this.loading() && this.recovery() === 'ready') this.modal.set('delete');
  }

  protected async deleteExpense(): Promise<void> {
    const detail = this.loaded();
    if (!detail || this.busy() || this.loading() || this.recovery() !== 'ready' || this.modal() !== 'delete') return;
    this.modal.set(null);
    this.attempted = { operation: 'delete', id: detail.id, etag: detail.etag };
    this.busy.set(true);
    try {
      await this.api.delete(detail.id, detail.etag);
      this.allowDeparture = true;
      await this.router.navigate(['/'], { queryParams: { deleted: '1' } });
    } catch (error: unknown) { await this.writeFailed(error); }
    finally { this.busy.set(false); }
  }

  private async writeFailed(error: unknown): Promise<void> {
    if (error instanceof HttpErrorResponse && error.status === 412) {
      this.recovery.set('stale');
      this.modal.set('recovery');
      this.message.set('Someone changed this expense after you opened it. Your edits are still here. Nothing was overwritten. Reloading discards your unsaved edits.');
    } else if (error instanceof HttpErrorResponse && error.status === 404) {
      this.unavailable();
    } else if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
      this.message.set('Sign in again from the account menu. This request was not authorised. Your edits are retained; nothing was saved or deleted.');
    } else if (error instanceof HttpErrorResponse && error.status === 422) {
      this.errors.update(errors => ({ ...errors, category: 'Choose a current category' }));
      this.message.set('Category was rejected. Choose a current category before saving. Your edits are retained.');
      await this.loadCategories();
    } else if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500 || error.status === 408) {
      await this.checkOutcome();
    } else {
      this.message.set('Request rejected. Your edits are still here. No changes were made. Try later.');
    }
  }

  private unavailable(): void {
    this.recovery.set('unavailable');
    this.modal.set('recovery');
    this.message.set('This expense no longer exists. Your edits cannot be saved to it. We will not recreate it.');
  }

  protected async checkOutcome(): Promise<void> {
    const attempt = this.attempted;
    if (!attempt || this.recovery() === 'checking') return;
    this.recovery.set('checking');
    this.modal.set('recovery');
    this.message.set('We did not receive a confirmed result. Checking this exact expense before another action. Your entered values are retained. Save and Delete are unavailable while checking.');
    try {
      const current = await this.api.detail(attempt.id);
      if (this.destroyed) return;
      this.current.set(current);
      this.recovery.set('found');
      this.modal.set('recovery');
      this.message.set('It still exists. This does not prove your operation succeeded. Your edits are retained. Reload current values to review; this discards your edits.');
    } catch (error: unknown) {
      if (this.destroyed) return;
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.recovery.set('absent');
        this.modal.set('recovery');
        this.message.set('The current check found no expense. This does not confirm who deleted it or whether your request succeeded. We will not repeat the write or recreate it.');
      } else {
        this.recovery.set('check-failed');
        this.modal.set('recovery');
        this.message.set('The result is still unknown. Your edits are retained. Check the current expense again before considering any new Save or Delete. No write will be retried.');
      }
    }
  }

  protected requestReload(): void { if (!this.busy() && !this.loading() && this.recovery() !== 'checking') this.modal.set('reload'); }
  protected reloadExpense(): void {
    this.modal.set(null);
    void this.read();
  }

  protected dateLabel(value: string | undefined): string {
    return value ? occurrenceDay(value).split('-').reverse().join('/') : '';
  }

  protected precisionRetained(): boolean { return this.knownInstant !== null; }

  isDirty(): boolean { return this.loaded() !== null && this.fields() !== this.originalFields; }

  canLeave(): boolean | Promise<boolean> {
    if (this.allowDeparture) return true;
    if (this.busy() || this.loading() || this.recovery() === 'checking') return false;
    if (!this.isDirty() && this.recovery() !== 'check-failed' && this.recovery() !== 'found') return true;
    if (this.departure) return false;
    this.modal.set('discard');
    return new Promise(resolve => { this.departure = resolve; });
  }

  protected closeModal(discard = false): void {
    if (this.recovery() === 'checking') return;
    this.modal.set(null);
    this.departure?.(discard);
    this.departure = null;
  }

  protected trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget as HTMLDialogElement;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty() || this.busy() || this.recovery() === 'checking' || this.recovery() === 'check-failed') { event.preventDefault(); event.returnValue = ''; }
  }

  protected cancel(): void { void this.router.navigate(['/']); }
}
