import '@angular/compiler';
import { Component } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { CreateExpensePage } from './create-expense-page';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

const TEST_ENV = { expenseTimestampsEnabled: true, apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Eating out' }] };
const PREFILL = { date: '2026-10-02', amount: 2.3, description: 'Coco Verde', category: 'Eating out' };

@Component({ selector: 'g-empty', template: '' })
class EmptyPage {}

describe('CreateExpensePage — voice prefill (issue #44, frame 3134:10053)', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'expenses/create', component: CreateExpensePage },
        ]),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    await harness.navigateByUrl('/');
  });

  afterEach(() => http.verify());

  async function arriveWithVoicePrefill(): Promise<void> {
    await router.navigate(['/expenses/create'], { state: { voicePrefill: PREFILL } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
  }

  function el(): HTMLElement {
    return document.querySelector('g-create-expense-page') as HTMLElement;
  }

  it('prefills amount (pt-PT comma), date and description and marks them AI suggested', async () => {
    await arriveWithVoicePrefill();
    const page = el();
    expect((page.querySelector('[data-testid="amount-input"]') as HTMLInputElement).value).toBe('2,30');
    expect((page.querySelector('[data-testid="date-input"]') as HTMLInputElement).value).toBe('2026-10-02');
    expect((page.querySelector('[data-testid="description-input"]') as HTMLInputElement).value).toBe('Coco Verde');
    for (const field of ['amount', 'date', 'description']) {
      expect(page.querySelector(`[data-testid="ai-suggested-${field}"]`)).not.toBeNull();
    }
  });

  it('preselects the AI category when the API offers it (marker included)', async () => {
    await arriveWithVoicePrefill();
    const page = el();
    const select = page.querySelector<HTMLSelectElement>('[data-testid="category-select"]');
    expect(select?.value).toBe('Eating out');
    expect(page.querySelector('[data-testid="ai-suggested-category"]')).not.toBeNull();
  });

  it('falls back to the first category when the AI one is unknown (no marker)', async () => {
    await router.navigate(['/expenses/create'], { state: { voicePrefill: { ...PREFILL, category: 'Spaceships' } } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    const page = el();
    expect((page.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('Clothing');
    expect(page.querySelector('[data-testid="ai-suggested-category"]')).toBeNull();
  });

  it('clears the AI suggested marker when the user edits the field', async () => {
    await arriveWithVoicePrefill();
    const page = el();
    const amount = page.querySelector<HTMLInputElement>('[data-testid="amount-input"]');
    amount!.value = '3,00';
    amount!.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(page.querySelector('[data-testid="ai-suggested-amount"]')).toBeNull();
  });

  it('a manual visit shows no markers and keeps the first-category default', async () => {
    await harness.navigateByUrl('/expenses/create');
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    const page = el();
    expect((page.querySelector('[data-testid="amount-input"]') as HTMLInputElement).value).toBe('');
    expect(page.querySelector('[data-testid="ai-suggested-amount"]')).toBeNull();
  });
});
