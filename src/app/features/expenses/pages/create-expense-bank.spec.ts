import '@angular/compiler';
import { Component } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { CreateExpensePage } from './create-expense-page';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Eating out' }] };
/** The BankPage accept payload (issue #61) — structurally the ExtractedExpense contract. */
const BANK_PREFILL = { description: 'CONTINENTE ONLINE 8831', amount: 58.93, date: '2026-10-02', category: 'Shopping' };
const CATEGORIES_WITH_SHOPPING = { categories: [{ name: 'Clothing' }, { name: 'Shopping' }, { name: 'Eating out' }] };

@Component({ selector: 'g-empty', template: '' })
class EmptyPage {}

describe('CreateExpensePage — bank prefill (issue #61)', () => {
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

  function el(): HTMLElement {
    return document.querySelector('g-create-expense-page') as HTMLElement;
  }

  it('prefills the form from history.state.bankPrefill and preselects the suggested category', async () => {
    await router.navigate(['/expenses/create'], { state: { bankPrefill: BANK_PREFILL } });
    http.expectOne('https://api.test/Category').flush(CATEGORIES_WITH_SHOPPING);
    await new Promise((r) => setTimeout(r, 0));
    harness.detectChanges();

    const page = el();
    const amount = page.querySelector<HTMLInputElement>('input[type=number], input[inputmode=decimal]');
    const description = page.querySelector<HTMLInputElement>('input[data-testid=description-input]');
    const select = page.querySelector<HTMLSelectElement>('select');
    expect(amount?.value.replace(',', '.')).toBe('58.93');
    expect(description?.value).toBe('CONTINENTE ONLINE 8831');
    expect(select?.value).toBe('Shopping');
    // the suggested category carries the AI-suggested marker until edited
    expect(page.textContent).toContain('AI suggested');
  });

  it('keeps accept usable when the bank row had no suggested category (manual pick)', async () => {
    await router.navigate(['/expenses/create'], {
      state: { bankPrefill: { ...BANK_PREFILL, category: '' } },
    });
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((r) => setTimeout(r, 0));
    harness.detectChanges();

    const select = el().querySelector<HTMLSelectElement>('select');
    // no suggestion: falls back to the API's first category, no AI marker
    expect(select?.value).toBe('Clothing');
    expect(el().textContent).not.toContain('AI suggested');
  });
});