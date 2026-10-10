import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { CreateExpensePage } from './create-expense-page';

const TEST_ENV = { expenseTimestampsEnabled: true, apiBaseUrl: 'https://api.test', googleClientId: 'cid' };
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
    TEST_ENV.expenseTimestampsEnabled = true;
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

  afterEach(() => { http.verify(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(SESSION_STORAGE_KEY); });

  it('legacy capability hides time and posts date-only even on a DST gap day', async () => {
    TEST_ENV.expenseTimestampsEnabled = false;
    const el = boot();
    await loadCategories();
    expect(el.querySelector('[data-testid="time-input"]')).toBeNull();
    for (const [id, value] of [['amount-input', '123456789,123456789'], ['description-input', 'Legacy'], ['date-input', '2026-03-29']]) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).toEqual({ date: '2026-03-29', amount: '123456789.123456789', description: 'Legacy', category: 'Clothing' });
    req.flush({ id: 12 });
    await fixture.whenStable();
  });

  it.each(['123456789.123456789', '9007199254740993', '0', '-1.25', '-123456789.123456789'])('posts exact manual decimal %s without Number rounding', async amount => {
    const el = boot();
    await loadCategories();
    for (const [id, value] of [['amount-input', amount], ['description-input', 'Exact']]) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body.amount).toBe(amount);
    req.flush({ id: 'exact' });
    await fixture.whenStable();
  });

  it.each(['-79228162514264337593543950336', '-0.00000000000000000000000000001'])('blocks decimal overflow %s before POST', async amount => {
    const el = boot();
    await loadCategories();
    for (const [id, value] of [['amount-input', amount], ['description-input', 'Overflow']]) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="field-error"]')?.textContent).toContain('Enter a valid decimal amount');
    http.expectNone('https://api.test/Expense');
  });

  it('posts the edited Lisbon date and native time with a summer offset and unchanged positive amount', async () => {
    const el = boot();
    await loadCategories();
    for (const [id, value] of [['amount-input', '65,55'], ['description-input', 'Lunch'], ['date-input', '2026-07-01'], ['time-input', '09:30']]) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
      expect(input).not.toBeNull();
      input!.value = value;
      input!.dispatchEvent(new Event('input'));
    }
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    const req = http.expectOne('https://api.test/Expense');
    expect(req.request.body).toEqual({ date: '2026-07-01', occurredAt: '2026-07-01T09:30:00+01:00', currency: 'EUR', amount: '65.55', description: 'Lunch', category: 'Clothing' });
    req.flush({ id: 'opaque-expense-id' });
    await fixture.whenStable();
  });

  it.each([
    ['2026-03-29', '01:30', 'does not exist'],
    ['2026-10-25', '01:30', 'occurs twice'],
    ['2026-02-30', '09:30', 'valid date'],
    ['2026-07-01', '', 'valid time'],
  ])('blocks invalid Lisbon occurrence %s %s before POST', async (date, time, message) => {
    const el = boot();
    await loadCategories();
    for (const [id, value] of [['amount-input', '12,34'], ['description-input', 'Lunch'], ['date-input', date], ['time-input', time]]) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    (el.querySelector('[data-testid="save-expense"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain(message);
    http.expectNone('https://api.test/Expense');
  });

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

  it('defaults native Date and Time to one captured Lisbon instant', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T23:15:42Z'));
    const el = boot();
    await loadCategories();
    const date = el.querySelector<HTMLInputElement>('[data-testid="date-input"]')!;
    const time = el.querySelector<HTMLInputElement>('[data-testid="time-input"]')!;
    expect(date.type).toBe('date');
    expect(date.value).toBe('2026-07-02');
    expect(time.type).toBe('time');
    expect(time.value).toBe('00:15');
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
    const body = req.request.body as { amount: string; description: string; date: string; category: string };
    expect(body.amount).toBe('65.55'); // Preserve the supplied sign — no negation.
    expect(body.description).toBe('Veggies and fruit');
    expect(body.category).toBe('Clothing');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 'created-opaque-id' });
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
