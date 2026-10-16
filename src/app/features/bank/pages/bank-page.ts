import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ExpenseApi } from '../../expenses/services/expense-api';
import { occurrenceDay } from '../../expenses/services/expense-time';
import type { LinkedExpense } from '../models/linked-expense';
import { categoryIcon } from '../../expenses/services/category-icon';
import { GIcon } from '../../../shared/gicon';
import { SyncButton } from '../components/sync-button';
import { BankApi } from '../services/bank-api';
import type { BankTransaction } from '../models/bank-transaction';
import type { BankReviewStatus } from '../models/bank-review-status';

function isHttp(error: unknown, status: number): boolean {
  return error instanceof HttpErrorResponse && error.status === status;
}

function dayLabel(value: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T12:00:00Z`);
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }).format(date)}, ${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date)}`;
}

/** Display-only debit convention from canonical List Expenses. Never alter wire amounts. */
function debit(amount: string, currency: string): string {
  if (!amount) return '—';
  const value = amount.startsWith('-') ? amount : `-${amount.replace(/^\+/, '')}`;
  const format = new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format as unknown as (value: string) => string;
  return format(value);
}

function expenseView<T extends { bookingDate: string; amount: string; currency: string; category: string }>(expense: T) {
  const instant = new Date(expense.bookingDate);
  return { ...expense, icon: categoryIcon(expense.category), displayAmount: debit(expense.amount, expense.currency),
    dateLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant),
    timeLabel: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant),
  };
}

function occurrenceFraction(value: string): string {
  return (/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '').padEnd(6, '0');
}

function historyOrder(a: LinkedExpense, b: LinkedExpense): number {
  // Date.parse resolves offsets but truncates microseconds; retain the fractional tie-break.
  return Date.parse(b.bookingDate) - Date.parse(a.bookingDate)
    || occurrenceFraction(b.bookingDate).localeCompare(occurrenceFraction(a.bookingDate))
    || b.id - a.id;
}

const LABELS = { needsReview: 'Needs review', matched: 'Matched', ignored: 'Ignored' };

/** Approved #134 review: explicit existing-Expense matches and independent read-only history. */
@Component({
  selector: 'g-bank-page',
  templateUrl: './bank-page.html',
  styleUrl: './bank.css',
  imports: [GIcon, SyncButton],
})
export class BankPage {
  private readonly bankApi = inject(BankApi);
  private readonly expenseApi = inject(ExpenseApi);
  protected readonly view = signal<'transactions' | 'expenses'>('transactions');
  protected readonly suggestions = signal<readonly LinkedExpense[] | null>(null);
  protected readonly suggestionError = signal(false);
  protected readonly shown = signal(3);
  private suggestionSequence = 0;
  protected readonly candidates = computed(() => (this.suggestions() ?? []).slice(0, this.shown()).map(expenseView));
  protected readonly remaining = computed(() => Math.max(0, (this.suggestions()?.length ?? 0) - this.shown()));
  protected readonly history = signal<readonly LinkedExpense[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly hasOlder = signal(false);
  private historyPages = 0;
  protected readonly historyGroups = computed(() => {
    const linked = new Set(this.transactions().flatMap(tx => tx.linkedExpense ? [tx.linkedExpense.id] : []));
    const suggested = new Set((this.suggestions() ?? []).map(expense => expense.id));
    const groups = new Map<string, (ReturnType<typeof expenseView<LinkedExpense>> & { meta: string })[]>();
    for (const expense of this.history()) {
      const key = occurrenceDay(expense.bookingDate);
      const row = { ...expenseView(expense), meta: `${expense.category} · ${linked.has(expense.id) ? 'Matched' : suggested.has(expense.id) ? 'Suggested' : 'Unlinked'}` };
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].sort((a, b) => b[0].localeCompare(a[0])).map(([key, rows]) => ({ key, label: dayLabel(key), rows }));
  });
  protected showMore(): void { this.shown.set(this.suggestions()?.length ?? 3); }
  protected async loadHistory(older = false): Promise<void> {
    if (this.historyLoading()) return;
    this.historyLoading.set(true);
    this.historyError.set(false);
    try {
      const count = older ? 1 : Math.max(1, this.historyPages);
      const rows: LinkedExpense[] = older ? [...this.history()] : [];
      let hasMore = false;
      for (let i = 0; i < count; i++) {
        const page = await this.expenseApi.history(older ? this.historyPages : i);
        rows.push(...page.expenses);
        hasMore = page.hasMore;
        if (!hasMore) break;
      }
      // Offset pages are live: dedupe repeated IDs without inventing identities.
      this.history.set([...new Map(rows.map(row => [row.id, row])).values()].sort(historyOrder));
      this.historyPages = older ? this.historyPages + 1 : count;
      this.hasOlder.set(hasMore);
    } catch { this.historyError.set(true); }
    finally { this.historyLoading.set(false); }
  }
  protected async loadSuggestions(): Promise<void> {
    const id = this.expandedId();
    const seq = ++this.suggestionSequence;
    this.suggestions.set(null);
    this.suggestionError.set(false);
    this.shown.set(3);
    const tx = this.transactions().find(row => row.id === id);
    if (!tx || tx.reviewStatus !== 'needsReview') { this.suggestions.set([]); return; }
    if (tx.suggestedExpenseCount === 0) { this.suggestions.set([]); return; }
    try {
      const rows = await this.bankApi.suggestions(tx.id);
      if (seq === this.suggestionSequence) this.suggestions.set(rows);
    } catch { if (seq === this.suggestionSequence) this.suggestionError.set(true); }
  }
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
    if (this.busy() || this.loadError() || tx.reviewStatus === 'matched') return;
    this.pendingId.set(tx.id);
    this.rowError.set(null);
    try {
      const updated = await (tx.reviewStatus === 'ignored' ? this.bankApi.review(tx.id) : this.bankApi.ignore(tx.id));
      this.transactions.update(rows => rows.map(row => row.id === tx.id ? updated : row));
      await this.loadSuggestions();
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
    if (!this.busy()) void this.refreshMatching();
  }
  protected async link(tx: BankTransaction, expenseId: number, action: 'match' | 'unmatch'): Promise<void> {
    if (this.busy() || this.loadError() || this.historyLoading() || this.expandedId() !== tx.id) return;
    const current = this.transactions().find(row => row.id === tx.id);
    if (!current || (action === 'match' ? current.reviewStatus !== 'needsReview' || !this.suggestions()?.some(expense => expense.id === expenseId)
      : current.linkedExpense?.id !== expenseId)) return;
    this.pendingId.set(tx.id);
    this.rowError.set(null);
    try {
      const updated = await this.bankApi[action](tx.id, expenseId);
      if (updated.id !== tx.id || (action === 'match' ? updated.linkedExpense?.id !== expenseId || updated.reviewStatus !== 'matched' : updated.linkedExpense !== null || updated.reviewStatus !== 'needsReview')) {
        throw new Error('Unconfirmed response');
      }
      await this.refreshMatching();
    } catch (error) {
      await this.refreshMatching();
      this.rowError.set({ id: tx.id, message: isHttp(error, 409)
        ? 'Transaction changed — review the refreshed state before choosing again.'
        : 'Could not confirm the change — review the current state before choosing again.' });
    } finally { this.pendingId.set(null); }
  }
  private async refreshMatching(): Promise<void> {
    ++this.suggestionSequence;
    this.suggestions.set(null);
    await Promise.all([this.load(), this.loadHistory()]);
    if (!this.loadError()) await this.loadSuggestions();
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
    .sort((a, b) => b.date.localeCompare(a.date) || (BigInt(a.id) === BigInt(b.id) ? 0 : BigInt(a.id) > BigInt(b.id) ? -1 : 1))
    .map(tx => ({
      ...tx,
      displayAmount: debit(tx.amount, tx.currency),
      dayKey: tx.date,
      dayLabel: dayLabel(tx.date),
      summary: `${LABELS[tx.reviewStatus]}${tx.reviewStatus === 'needsReview' ? ` · ${tx.suggestedExpenseCount > 0 ? `${tx.suggestedExpenseCount} suggestions` : 'No suggested matches'}` : tx.linkedExpense ? ` · Expense: ${tx.linkedExpense.description}` : ''}`,
      linkedView: tx.linkedExpense ? expenseView(tx.linkedExpense) : null,
    })));

  constructor() { void this.load(); void this.loadHistory(); }
  protected toggle(id: string): void {
    this.expandedId.update(current => current === id ? null : id);
    void this.loadSuggestions();
  }
  protected selectFilter(value: BankReviewStatus | 'all'): void {
    this.filter.set(value);
    this.expandedId.set(null);
    void this.loadSuggestions();
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
    if (this.busy() || this.loadError()) return;
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
