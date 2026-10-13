import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { GIcon } from '../../../shared/gicon';
import { SyncButton } from '../components/sync-button';
import { BankApi } from '../services/bank-api';
import type { BankTransaction } from '../models/bank-transaction';
import type { BankReviewStatus } from '../models/bank-review-status';

function isHttp(error: unknown, status: number): boolean {
  return error instanceof HttpErrorResponse && error.status === status;
}
function day(value: string): string {
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'Unknown date';
}
function money(amount: string, currency: string): string {
  if (!amount) return '—';
  try {
    // ECMA-402 accepts exact decimal strings; TypeScript's signature still only names number/bigint.
    const format = new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format as unknown as (value: string) => string;
    return format(amount);
  }
  catch { return `${amount} ${currency}`; }
}
const LABELS = { needsReview: 'Needs review', matched: 'Matched', ignored: 'Ignored' };

/** Approved #133 inbox: all rows collapsed on entry, one inline detail on click. */
@Component({
  selector: 'g-bank-page',
  templateUrl: './bank-page.html',
  styleUrl: './bank.css',
  imports: [GIcon, NgTemplateOutlet, SyncButton],
})
export class BankPage {
  private readonly bankApi = inject(BankApi);
  private readonly router = inject(Router);
  protected readonly transactions = signal<readonly BankTransaction[]>([]);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly filter = signal<BankReviewStatus | 'all'>('all');
  protected readonly filters = [
    { value: 'all', label: 'All' }, { value: 'needsReview', label: 'Needs review' },
    { value: 'matched', label: 'Matched' }, { value: 'ignored', label: 'Ignored' },
  ] as const;
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal(false);
  protected readonly syncing = signal(false);
  // Serialize transitions and refreshes so an older list cannot overwrite an updated row.
  protected readonly pendingId = signal<string | null>(null);
  protected readonly rowError = signal<{ id: string; message: string } | null>(null);
  protected readonly busy = computed(() => this.refreshing() || this.syncing() || this.pendingId() !== null);
  protected async transition(tx: BankTransaction): Promise<void> {
    if (this.busy() || tx.reviewStatus === 'matched') return;
    this.pendingId.set(tx.id);
    this.rowError.set(null);
    try {
      const updated = await (tx.reviewStatus === 'ignored' ? this.bankApi.review(tx.id) : this.bankApi.ignore(tx.id));
      this.transactions.update(rows => rows.map(row => row.id === tx.id ? updated : row));
    } catch (error) {
      if (isHttp(error, 409)) {
        this.rowError.set({ id: tx.id, message: 'Transaction changed — refreshing its review state.' });
        await this.load();
        this.rowError.set({ id: tx.id, message: this.loadError()
          ? 'Could not refresh transaction — previous list unchanged. Use Retry.'
          : 'Transaction changed — review the refreshed state.' });
      } else this.rowError.set({ id: tx.id, message: 'Could not update transaction — try again.' });
    } finally { this.pendingId.set(null); }
  }
  protected retry(): void {
    if (!this.busy()) void this.load();
  }
  protected readonly syncResult = signal<string | null>(null);
  protected readonly notLinked = signal(false);
  readonly linked = input<string>();
  protected readonly linkedConfirmed = computed(() => {
    const count = Math.trunc(Number(this.linked()));
    return Number.isFinite(count) && count > 0 ? count : null;
  });
  protected readonly rows = computed(() => this.transactions()
    .filter(tx => this.filter() === 'all' || tx.reviewStatus === this.filter())
    .map(tx => ({
      ...tx,
      meta: `${day(tx.date)} · ${LABELS[tx.reviewStatus]}`,
      displayAmount: money(tx.amount, tx.currency),
      expenseDate: tx.linkedExpense ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(tx.linkedExpense.bookingDate)) : '',
      expenseAmount: tx.linkedExpense ? money(tx.linkedExpense.amount, tx.linkedExpense.currency) : '',
    })));

  constructor() { void this.load(); }
  protected toggle(id: string): void {
    this.expandedId.update(current => current === id ? null : id);
  }
  protected selectFilter(value: BankReviewStatus | 'all'): void {
    this.filter.set(value);
    this.expandedId.set(null);
  }
  protected async load(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      const rows = await this.bankApi.list();
      this.transactions.set(rows);
      this.loadError.set(false);
      if (!rows.some(tx => tx.id === this.expandedId())) this.expandedId.set(null);
      if (rows.length === 0) await this.probeLink();
      else this.notLinked.set(false);
    } catch (error) {
      if (isHttp(error, 409)) this.notLinked.set(true);
      else this.loadError.set(true);
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }
  private async probeLink(): Promise<void> {
    try { this.notLinked.set((await this.bankApi.connections()).length === 0); }
    catch { /* A failed connection probe preserves the last known state. */ }
  }
  protected async sync(): Promise<void> {
    if (this.busy()) return;
    this.syncing.set(true);
    try {
      const result = await this.bankApi.sync();
      this.syncResult.set(`+${result.new} new · ${result.fetched} fetched`);
      await this.load();
    } catch (error) {
      if (isHttp(error, 409)) {
        this.notLinked.set(true);
        this.syncResult.set('No bank connected — open Settings to link your bank.');
      } else this.syncResult.set('Sync failed — try again');
    } finally { this.syncing.set(false); }
  }
  protected openSettings(): void { void this.router.navigate(['/settings']); }
}
