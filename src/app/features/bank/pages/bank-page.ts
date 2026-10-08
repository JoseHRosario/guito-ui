import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { GIcon, type IconName } from '../../../shared/gicon';
import { SyncButton } from '../components/sync-button';
import { formatEur } from '../../expenses/services/money';
import { BankApi } from '../services/bank-api';
import type { BankTransaction } from '../models/bank-transaction';

/** Suggested category → list-row lucide glyph; 'briefcase' fallback for unknown categories. */
function categoryIcon(category: string | null): IconName {
  if (category === null) return 'briefcase';
  const ICONS: Readonly<Record<string, IconName>> = {
    clothing: 'tag',
    broadband: 'wifi',
    shopping: 'shopping-bag',
    bills: 'zap',
    entertainment: 'film',
    snacks: 'utensils',
    health: 'heart',
    'eating out': 'utensils',
  };
  return ICONS[category.toLowerCase()] ?? 'briefcase';
}

/** Date-group header: 'Today · 02/10/2026' / 'Yesterday · …' / plain date. */
export function groupLabel(isoDate: string, todayIso: string): string {
  const diff = daysBetween(todayIso, isoDate);
  const date = isoDate.slice(8, 10) + '/' + isoDate.slice(5, 7) + '/' + isoDate.slice(0, 4);
  if (diff === 0) return `Today · ${date}`;
  if (diff === 1) return `Yesterday · ${date}`;
  return date;
}

/** Whole days `from` − `to` (both ISO yyyy-MM-dd), ignoring DST edges. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

interface TransactionGroup {
  date: string;
  label: string;
  transactions: BankTransaction[];
}

/**
 * Bank review page (issue #61): pending (unmatched) bank transactions with
 * sync and accept-to-expense, per the approved Figma frames (mobile 3201:270,
 * desktop 3201:10189). Accept opens the Create Expense form prefilled; there
 * is no reject action in this MVP (unmatched rows stay visible until matched —
 * match flow is guito-api#83).
 */
@Component({
  selector: 'g-bank-page',
  templateUrl: './bank-page.html',
  styleUrl: './bank.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GIcon, NgTemplateOutlet, SyncButton],
})
export class BankPage {
  private readonly bankApi = inject(BankApi);
  private readonly router = inject(Router);

  protected readonly transactions = signal<readonly BankTransaction[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly syncing = signal(false);
  /** Result of the last sync, e.g. '+3 new · 12 fetched'; null hides the line. */
  protected readonly syncResult = signal<string | null>(null);

  /** Groups newest-first so the review starts at the most recent booking day. */
  protected readonly groups = computed<TransactionGroup[]>(() => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const byDate = new Map<string, BankTransaction[]>();
    for (const tx of this.transactions()) {
      const list = byDate.get(tx.date) ?? [];
      list.push(tx);
      byDate.set(tx.date, list);
    }
    return [...byDate.keys()]
      .sort()
      .reverse()
      .map((date) => ({ date, label: groupLabel(date, todayIso), transactions: byDate.get(date) ?? [] }));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      const rows = await this.bankApi.pending();
      this.transactions.set(rows);
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async sync(): Promise<void> {
    if (this.syncing()) return;
    this.syncing.set(true);
    try {
      const result = await this.bankApi.sync();
      this.syncResult.set(`+${result.new} new · ${result.fetched} fetched`);
      await this.load();
    } catch {
      this.syncResult.set('Sync failed — try again');
    } finally {
      this.syncing.set(false);
    }
  }

  /** Accept → the existing Create Expense form, prefilled from the bank row. */
  protected accept(transaction: BankTransaction): void {
    void this.router.navigate(['/expenses/create'], {
      state: {
        bankPrefill: {
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          category: transaction.suggestedCategory ?? '',
        },
      },
    });
  }

  protected iconFor(transaction: BankTransaction): IconName {
    return categoryIcon(transaction.suggestedCategory);
  }

  /** pt-PT EUR for the common case; any other currency falls back to a plain 2-decimal render. */
  protected amountFor(transaction: BankTransaction): string {
    return transaction.currency === 'EUR' ? formatEur(transaction.amount) : `${transaction.amount.toFixed(2)} ${transaction.currency}`;
  }
}