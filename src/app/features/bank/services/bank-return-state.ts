import { Injectable, signal } from '@angular/core';
import type { BankReviewStatus } from '../models/bank-review-status';

/** One tab's review position. Data is always fetched again on return. */
@Injectable({ providedIn: 'root' })
export class BankReturnState {
  readonly filter = signal<BankReviewStatus | 'all'>('all');
  readonly expandedId = signal<string | null>(null);
  readonly view = signal<'transactions' | 'expenses'>('transactions');
  readonly transactionScroll = signal(0);
  readonly historyScroll = signal(0);
  readonly historyPages = signal(1);
  readonly shown = signal(3);
  readonly returning = signal(false);
  constructor() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('guito.bank-return') ?? 'null') as { filter: BankReviewStatus | 'all'; expandedId: string | null; view: 'transactions' | 'expenses'; historyPages?: number; shown?: number; transactionScroll: number; historyScroll: number } | null;
      if (saved && ['all', 'needsReview', 'matched', 'ignored'].includes(saved.filter) &&
        ['transactions', 'expenses'].includes(saved.view) && (saved.expandedId === null || typeof saved.expandedId === 'string') &&
        Number.isInteger(saved.historyPages ?? 1) && (saved.historyPages ?? 1) > 0 && Number.isInteger(saved.shown ?? 3) && (saved.shown ?? 3) >= 3 &&
        Number.isFinite(saved.transactionScroll) && saved.transactionScroll >= 0 && Number.isFinite(saved.historyScroll) && saved.historyScroll >= 0) {
        this.historyPages.set(saved.historyPages ?? 1); this.shown.set(saved.shown ?? 3);
        this.filter.set(saved.filter); this.view.set(saved.view); this.expandedId.set(saved.expandedId);
        this.transactionScroll.set(saved.transactionScroll); this.historyScroll.set(saved.historyScroll); this.returning.set(true);
      }
    } catch { /* Position is optional; operation recovery independently fails closed. */ }
  }
  retain(): void {
    sessionStorage.setItem('guito.bank-return', JSON.stringify({ filter: this.filter(), view: this.view(),
      expandedId: this.expandedId(), historyPages: this.historyPages(), shown: this.shown(), transactionScroll: this.transactionScroll(), historyScroll: this.historyScroll() }));
  }
  consume(): void {
    this.returning.set(false);
    try { sessionStorage.removeItem('guito.bank-return'); } catch { /* Optional view state. */ }
  }
}
