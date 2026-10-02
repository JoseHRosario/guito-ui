import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { ExpensesPage } from './expenses-page';
import { CreateExpensePage } from './create-expense-page';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

/**
 * Controllable Web Speech API fake (issue #44): tests drive the flow through
 * the same events the real recognition fires — results, then `onend` when the
 * recording stops (silence auto-stop or cancel).
 */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start(): void {
    FakeRecognition.last = this;
  }
  stop(): void {}
  abort(): void {}
  emit(transcript: string): void {
    this.onresult?.({ results: [[{ transcript }]] });
  }
  end(): void {
    this.onend?.();
  }
}

const EXTRACT_OK = { date: '2026-10-02T00:00:00Z', amount: 2.3, description: 'Coco Verde', category: 'Eating out' };

describe('ExpensesPage voice capture (issue #44, frames 3141:2 / 3141:180)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ExpensesPage>;
  let router: Router;

  function render(): HTMLElement {
    fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function openDial(el: HTMLElement): void {
    el.querySelector<HTMLButtonElement>('[data-testid="add-expense-fab"]')?.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([])), provideHttpClientTesting(), provideRouter([{ path: 'expenses/create', component: CreateExpensePage }]), { provide: APP_ENVIRONMENT, useValue: TEST_ENV }],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    vi.restoreAllMocks();
    http.verify();
  });

  /** Flushes the latest-expenses load so the dial is interactive. */
  async function loadList(): Promise<void> {
    http.expectOne('https://api.test/Expense/latest/20').flush({
      expenses: [{ storedOrder: 12, date: '2021-01-03T10:12:00', amount: 65.55, description: 'H&M', category: 'Clothing', creatorEmail: 'a@b.c' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('orders the dial pills Manual, Voice, favorite and paints them with the primary token', async () => {
    const el = render();
    await loadList();
    openDial(el);
    const pills = [...el.querySelectorAll('[data-testid^="speed-dial-"]')].filter(
      (node) => node.tagName === 'BUTTON' && !node.matches('[data-testid="speed-dial-scrim"]'),
    );
    expect(pills.map((p) => p.getAttribute('data-testid'))).toEqual(['speed-dial-manual', 'speed-dial-voice', 'speed-dial-favorite-morning-coffee']);
    for (const pill of pills) expect(pill.className).toContain('bg-primary');
  });

  it('listening shows the speak icon in the Voice pill (no separate overlay)', async () => {
    const el = render();
    await loadList();
    openDial(el);
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="voice-speak-icon"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="speed-dial-menu"]')).not.toBeNull();
  });

  it('transcript → spinner in the pill → POST /AI/extract → navigates to the create form prefilled', async () => {
    const el = render();
    await loadList();
    openDial(el);
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]')?.click();
    fixture.detectChanges();
    FakeRecognition.last?.emit('café dois e trinta no Coco Verde');
    FakeRecognition.last?.end();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="voice-spinner"]')).not.toBeNull();
    });
    const req = await vi.waitFor(() => {
      const request = http.expectOne('https://api.test/AI/extract');
      return request;
    });
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ language: 'pt-PT', prompt: 'café dois e trinta no Coco Verde' });
    req.flush(EXTRACT_OK);
    await vi.waitFor(() => {
      expect(router.url).toBe('/expenses/create');
    });
    // Dial closes; the create form receives the proposal via history state.
    expect(el.querySelector('[data-testid="speed-dial-menu"]')).toBeNull();
  });

  it('silence (empty transcript) returns to idle without a toast or extract call', async () => {
    const el = render();
    await loadList();
    openDial(el);
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]')?.click();
    fixture.detectChanges();
    FakeRecognition.last?.end(); // auto-stop with nothing heard
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="voice-spinner"]')).toBeNull();
    expect(el.querySelector('[data-testid="voice-toast"]')).toBeNull();
    http.expectNone('https://api.test/AI/extract');
  });

  it('unusable extract → toast + stay on the list', async () => {
    const el = render();
    await loadList();
    openDial(el);
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]')?.click();
    fixture.detectChanges();
    FakeRecognition.last?.emit('alguma coisa');
    FakeRecognition.last?.end();
    const req = await vi.waitFor(() => http.expectOne('https://api.test/AI/extract'));
    req.flush({ message: 'stub' }, { status: 501, statusText: 'Not Implemented' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      const toast = el.querySelector('[data-testid="voice-toast"]');
      expect(toast?.textContent).toContain("Couldn't understand — try again or create manually.");
    });
    expect(router.url).not.toBe('/expenses/create');
  });

  it('without the Web Speech API the Voice pill is visible-but-disabled with a note', async () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    const el = render();
    await loadList();
    openDial(el);
    const pill = el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]');
    expect(pill?.disabled).toBe(true);
    expect(el.querySelector('[data-testid="voice-unsupported-note"]')?.textContent).toContain("isn't supported");
  });

  it('closing the dial while listening cancels silently (scrim tap)', async () => {
    const el = render();
    await loadList();
    openDial(el);
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-voice"]')?.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="speed-dial-scrim"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="speed-dial-menu"]')).toBeNull();
    expect(el.querySelector('[data-testid="voice-toast"]')).toBeNull();
    http.expectNone('https://api.test/AI/extract');
  });
});