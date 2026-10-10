import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { formatEur } from '../services/money';
import { lisbonNow, occurrenceDay } from '../services/expense-time';

// --- list-model helpers (folded single-consumer helpers, guito-api#40/#9) ---

export interface ExpenseDayGroup {
  /** ISO date key (yyyy-MM-dd) of the group. */
  key: string;
  /** Human label matching the approved frames, e.g. "Jan 03, Sunday". */
  label: string;
  expenses: readonly Expense[];
}

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });

/** Groups expenses onto calendar days (newest first). */
function groupExpensesByDay(expenses: readonly Expense[]): ExpenseDayGroup[] {
  const byDay = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const day = occurrenceDay(expense.date);
    byDay.set(day, [...(byDay.get(day) ?? []), expense]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, group]) => {
      const date = new Date(key + 'T12:00:00Z');
      return { key, label: `${dayLabel.format(date)}, ${weekdayLabel.format(date)}`, expenses: group };
    });
}

const longMonth = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

/** The list's month label (e.g. "January, 2021"), from the newest expense; '' when empty. */
function monthLabelOf(expenses: readonly Expense[]): string {
  // The server orders by occurrence instant; lexical offsets are not chronological.
  const newest = expenses[0]?.date;
  if (!newest) return '';
  const date = new Date(`${occurrenceDay(newest)}T12:00:00Z`);
  return `${longMonth.format(date)}, ${date.getUTCFullYear()}`;
}
import type { Expense } from '../models/expense';
import { ExpenseApi } from '../services/expense-api';
import { AiExtractApi } from '../services/ai-extract';
import type { VoicePrefillState } from './create-expense-page';
import { SpeechCapture, speechSupported } from '../services/speech-capture';
import { FAVORITES } from '../services/favorites';
import type { Favorite } from '../services/favorites';
import { GIcon } from '../../../shared/gicon';
import { MonthNav } from '../components/month-nav';

/**
 * Latest-expenses screen, LIVE from the deployed API (guito-api#9): loads
 * `GET /Expense/latest/20` on entry (Bearer ID token via the auth
 * interceptor), with loading / error+retry / empty states; the summary bar
 * derives from the loaded data (the API has no summary endpoint).
 */
@Component({
  selector: 'g-expenses-page',
  templateUrl: './expenses-page.html',
  styleUrl: './expenses-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MonthNav, GIcon, NgTemplateOutlet],
})
export class ExpensesPage {
  private readonly expenseApi = inject(ExpenseApi);
  private readonly aiExtract = inject(AiExtractApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private destroyed = false;
  /** Guards against a stale response (e.g. a retry racing a slow first load). */
  private loadSequence = 0;

  /** null = loading; empty array = loaded with no expenses. */
  protected readonly expenses = signal<readonly Expense[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /** True while a latest-expenses request is in flight (refresh-button spinner). */
  protected readonly refreshing = signal(false);

  protected readonly month = computed(() => monthLabelOf(this.expenses() ?? []));
  protected readonly groups = computed(() => groupExpensesByDay(this.expenses() ?? []));
  protected readonly sidebarWallet = computed(() => formatEur(12450, { signed: true }));

  /** "Expense saved" toast (frame 3094:10243): bottom-center above nav, auto-dismiss ~3s. */
  protected readonly savedToast = signal(false);

  protected readonly amount = formatEur;

  /** Favorites speed-dial (issue #43, ADR 0012): FAB toggles the action menu. */
  protected readonly favorites = FAVORITES;
  protected readonly speedDialOpen = signal(false);
  /** The favorite name whose create POST is in flight (disables the dial buttons). */
  protected readonly favoriteSaving = signal<string | null>(null);
  protected readonly favoriteError = signal<string | null>(null);

  /** Voice capture state machine (issue #44): idle → listening → extracting. */
  protected readonly voiceState = signal<'idle' | 'listening' | 'extracting'>('idle');
  /** "Couldn't understand" toast (frame 3141:180 → failure path): bottom-center, auto-dismiss. */
  protected readonly voiceToast = signal<string | null>(null);
  /** Bumps on every state reset — stale extract responses become no-ops. */
  private voiceSequence = 0;
  private voiceToastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Firefox/Safari: Voice pill visible but disabled with a note (approved frame). */
  protected readonly voiceSupported = speechSupported();
  private readonly speech = new SpeechCapture();

  /** One guard for every dial action while a voice capture or favorite create is in flight. */
  protected readonly dialBusy = computed(() => this.favoriteSaving() !== null || this.voiceState() !== 'idle');

  protected toggleSpeedDial(): void {
    this.favoriteError.set(null);
    this.speedDialOpen.update((open) => !open);
  }

  protected closeSpeedDial(): void {
    // Closing the dial cancels the in-flight voice capture (issue #44):
    // listening aborts the recording; a running extract is invalidated by the
    // sequence bump so its success can no longer navigate.
    this.voiceSequence++;
    if (this.voiceState() === 'listening') this.speech.cancel();
    this.speedDialOpen.set(false);
    this.favoriteError.set(null);
  }

  /**
   * Voice path (issue #44, approved frames 3141:2/3141:180): pill shows the
   * speak icon while listening; recording auto-stops on silence; the pill's
   * icon swaps to a spinner while POST /AI/extract runs; success closes the
   * dial and navigates to the create form prefilled (user still saves
   * explicitly). Failure/unusable result → toast + stay on the list.
   */
  protected startVoice(): void {
    if (this.dialBusy() || !this.voiceSupported) return;
    this.favoriteError.set(null);
    this.voiceState.set('listening');
    const seq = this.voiceSequence;
    void this.speech.start().then(
      (transcript) => {
        if (this.destroyed || seq !== this.voiceSequence) return;
        // Empty transcript = silence or cancelled: back to idle, no error.
        if (transcript === '') {
          this.voiceState.set('idle');
          return;
        }
        this.voiceState.set('extracting');
        void this.aiExtract.extract(transcript).then(
          (prefill) => {
            if (this.destroyed || seq !== this.voiceSequence) return;
            this.voiceState.set('idle');
            this.speedDialOpen.set(false);
            void this.router.navigate(['/expenses/create'], { state: { voicePrefill: prefill } satisfies VoicePrefillState });
          },
          () => {
            if (this.destroyed || seq !== this.voiceSequence) return;
            this.voiceFailed("Couldn't understand — try again or create manually.");
          },
        );
      },
      () => {
        if (this.destroyed || seq !== this.voiceSequence) return;
        this.voiceFailed("Couldn't hear you — try again.");
      },
    );
  }

  private voiceFailed(message: string): void {
    this.voiceState.set('idle');
    if (this.destroyed) return;
    this.voiceToast.set(message);
    if (this.voiceToastTimer !== null) clearTimeout(this.voiceToastTimer);
    this.voiceToastTimer = setTimeout(() => {
      this.voiceToastTimer = null;
      if (!this.destroyed) this.voiceToast.set(null);
    }, 4000);
  }

  /** url-safe slug for the per-favorite data-testid (e.g. 'Morning Coffee' → 'morning-coffee'). */
  protected favoriteSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /** Instant-creates an Expense from a favorite: date = today, amount as-is (ADR 0010 positive). */
  protected createFavorite(favorite: Favorite): void {
    if (this.dialBusy()) return;
    this.favoriteError.set(null);
    this.favoriteSaving.set(favorite.name);
    const { date, occurredAt } = lisbonNow();
    void this.expenseApi
      .create({ date, occurredAt, currency: 'EUR', amount: favorite.amount, description: favorite.description, category: favorite.category })
      .then(
        () => {
          this.favoriteSaving.set(null);
          this.closeSpeedDial();
          if (!this.destroyed) {
            // Navigating '/' → '/?saved=1' reuses this component (params-only
            // change, no reconstruction), so refresh the list explicitly.
            this.load();
            void this.router.navigate(['/'], { queryParams: { saved: '1' } });
          }
        },
        () => {
          this.favoriteSaving.set(null);
          this.favoriteError.set('Could not save the expense — check your connection and try again.');
        },
      );
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.voiceToastTimer !== null) clearTimeout(this.voiceToastTimer);
    });
    this.load();
    // The create page lands back here with saved=1 → reload the list (route reuse
    // means the component was detached during the create flow — no constructor load
    // fires on return), show the toast once, then clear the param.
    this.router.events.subscribe((event) => {
      if (this.destroyed || !(event instanceof NavigationEnd)) return;
      if (this.router.parseUrl(event.urlAfterRedirects).queryParams['saved'] === '1') {
        this.load();
        this.savedToast.set(true);
        setTimeout(() => {
          if (!this.destroyed) {
            this.savedToast.set(false);
            void this.router.navigate([], { queryParams: { saved: null }, queryParamsHandling: 'merge' });
          }
        }, 3000);
      }
    });
  }

  protected createExpense(): void {
    void this.router.navigate(['/expenses/create']);
  }

  /** Refresh-button reload: spinner feedback while the request runs. */
  protected refresh(): void {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.refreshing.set(true);
    const seq = ++this.loadSequence;
    void this.expenseApi.latest().then(
      (expenses) => {
        if (!this.destroyed && seq === this.loadSequence) this.expenses.set(expenses);
      },
      () => {
        if (!this.destroyed && seq === this.loadSequence) {
          this.loadError.set('Could not load your expenses — check your connection and try again.');
        }
      },
    ).finally(() => {
      // Spinner clears when THIS request settles (a newer reload may have started).
      if (!this.destroyed && seq === this.loadSequence) this.refreshing.set(false);
    });
  }
}
