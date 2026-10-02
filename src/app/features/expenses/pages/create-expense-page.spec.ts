import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { CreateExpensePage } from './create-expense-page';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
const CATEGORIES = { categories: [{ name: 'Clothing' }, { name: 'Food' }] };

describe('CreateExpensePage (issue #32, frames 3094:35 / 3094:9937 / 3094:10011)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CreateExpensePage>;
  let router: Router;

  function boot(): HTMLElement {
    fixture = TestBed.createComponent(CreateExpensePage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });


  /** Flushes GET /Category and settles the async chain (promise + macrotask) before CD. */
  async function loadCategories(): Promise<void> {
    http.expectOne('https://api.test/Category').flush(CATEGORIES);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('loads categories live from GET /Category and preselects the first', async () => {
    const el = boot();
    await loadCategories();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="category-select"]');
    expect(select?.value).toBe('Clothing');
    const options = [...(select?.options ?? [])].map((o) => o.value);
    expect(options).toEqual(['Clothing', 'Food']);
  });

  it('renders the four labeled fields from the approved frame', async () => {
    const el = boot();
    await loadCategories();
    expect(el.querySelector('[data-testid="create-title"]')?.textContent).toContain('Create Expense');
    for (const id of ['amount-input', 'description-input', 'date-input']) {
      expect(el.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    expect(el.querySelector('[data-testid="save-expense"]')?.textContent).toContain('Save Expense');
  });

  it('date is a single daisyUI date input defaulting to today (ISO yyyy-MM-dd)', async () => {
    const el = boot();
    await loadCategories();
    const date = el.querySelector('[data-testid="date-input"]') as HTMLInputElement;
    expect(date.type).toBe('date');
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(date.value).toBe(expected);
  });

  it('invalid submit shows inline errors and never calls POST /Expense', async () => {
    const el = boot();
    await loadCategories();
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="field-error"]').length).toBeGreaterThan(0);
    http.expectNone('https://api.test/Expense');
  });

  it('valid submit POSTs /Expense with the parsed payload and navigates back with saved=1', async () => {
    const el = boot();
    await loadCategories();
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (el.querySelector('[data-testid="amount-input"]') as HTMLInputElement).value = '65,55';
    (el.querySelector('[data-testid="amount-input"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (el.querySelector('[data-testid="description-input"]') as HTMLInputElement).value = 'Veggies and fruit';
    (el.querySelector('[data-testid="description-input"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as { amount: number; description: string; date: string; category: string };
    expect(body.amount).toBe(65.55); // ADR 0010: amounts stored positive — no negation.
    expect(body.description).toBe('Veggies and fruit');
    expect(body.category).toBe('Clothing');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 42 });
    await vi.waitFor(() => expect(navSpy).toHaveBeenCalledWith(['/'], { queryParams: { saved: '1' } }));
  });

  it('failed save keeps the user on the form with the error card and values intact', async () => {
    const el = boot();
    await loadCategories();
    (el.querySelector('[data-testid="amount-input"]') as HTMLInputElement).value = '10';
    (el.querySelector('[data-testid="amount-input"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (el.querySelector('[data-testid="description-input"]') as HTMLInputElement).value = 'Veggies';
    (el.querySelector('[data-testid="description-input"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    const navSpy = vi.spyOn(router, 'navigate');
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('https://api.test/Expense').flush('nope', { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() =>
      expect(el.querySelector('[data-testid="save-error"]')?.textContent).toContain('Could not save the expense'),
    );
    fixture.detectChanges();
    expect((el.querySelector('[data-testid="amount-input"]') as HTMLInputElement).value).toBe('10');
    expect(navSpy).not.toHaveBeenCalled();
  });
});
