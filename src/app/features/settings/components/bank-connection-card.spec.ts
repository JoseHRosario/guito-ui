import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { serializeSession, SESSION_STORAGE_KEY } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { BankConnectionCard } from './bank-connection-card';

const TEST_ENV = { apiBaseUrl: 'https://api.test', googleClientId: 'cid' };

const ACCOUNT = {
  name: 'Conta Casa',
  ibanMasked: '•••• 1234',
  currency: 'EUR',
  aspspName: 'Activo Bank',
  aspspCountry: 'PT',
  consentStatus: 'VALID',
  consentExpiresAt: '2027-01-06T12:00:00Z',
};

describe('BankConnectionCard (issue #64)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({ idToken: 'id-token', accessToken: 'access', expiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      imports: [BankConnectionCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: TEST_ENV },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(SESSION_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  function make(): { fixture: ReturnType<typeof TestBed.createComponent<BankConnectionCard>>; el: HTMLElement } {
    const fixture = TestBed.createComponent(BankConnectionCard);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function flushConnections(accounts: object[]): void {
    http.expectOne('https://api.test/BankConnection').flush({ accounts });
  }

  /** Zoneless settle: re-render inside vi.waitFor until the state shows. */
  async function settle(fixture: ReturnType<typeof TestBed.createComponent<BankConnectionCard>>, probe: () => boolean): Promise<void> {
    await vi.waitFor(() => {
      fixture.detectChanges();
      if (!probe()) throw new Error('not settled yet');
    });
    fixture.detectChanges();
  }

  it('unlinked: shows the no-bank status, the hardcoded ASPSP line and the generic consent note', async () => {
    const { fixture, el } = make();
    // the transient loading line renders BEFORE the response settles (assertion per CONVENTIONS.md)
    expect(el.querySelector('[data-testid=bank-connection-loading]')).not.toBeNull();
    flushConnections([]);
    await settle(fixture, () => el.querySelector('[data-testid=bank-status]') !== null);

    expect(el.querySelector('[data-testid=bank-status]')!.textContent!.trim()).toBe('No bank connected');
    expect(el.textContent).toContain('Activo Bank · Portugal — link to pull transactions');
    expect(el.querySelector('[data-testid=bank-consent-note]')!.textContent!.trim()).toBe(
      'Consent expires 90–180 days after linking — re-link from here.',
    );
    expect(el.querySelector('[data-testid=link-bank]')).not.toBeNull();
  });

  it('linked: lists the masked accounts and the actual consent expiry', async () => {
    const { fixture, el } = make();
    flushConnections([ACCOUNT, { ...ACCOUNT, name: 'Conta 2', ibanMasked: '' }]);
    await settle(fixture, () => el.querySelectorAll('[data-testid=bank-account]').length === 2);

    const rows = Array.from(el.querySelectorAll('[data-testid=bank-account]'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Conta Casa');
    expect(rows[0].textContent).toContain('•••• 1234');
    expect(el.querySelector('[data-testid=bank-account-list]')).not.toBeNull();
    expect(el.querySelector('[data-testid=bank-status]')).toBeNull();
    expect(el.querySelector('[data-testid=bank-consent-note]')!.textContent!.trim()).toBe(
      'Consent expires 06/01/2027 — re-link from here.',
    );
  });

  it('load failure shows an explicit unavailable line', async () => {
    const { fixture, el } = make();
    http
      .expectOne('https://api.test/BankConnection')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture, () => el.querySelector('[data-testid=bank-connection-error]') !== null);
    expect(el.querySelector('[data-testid=bank-connection-error]')).not.toBeNull();
  });

  it('an expired consent (past expiry date) shows the re-link line (issue #64 AC5 edge)', async () => {
    const { fixture, el } = make();
    flushConnections([{ ...ACCOUNT, consentExpiresAt: '2020-01-01T00:00:00Z' }]);
    await settle(fixture, () => el.querySelectorAll('[data-testid=bank-account]').length === 1);
    expect(el.querySelector('[data-testid=bank-consent-note]')!.textContent!.trim()).toBe(
      'Consent expired — link your bank again.',
    );
  });

  it('an EXPIRED consent status shows the re-link line even with a future date', async () => {
    const { fixture, el } = make();
    flushConnections([{ ...ACCOUNT, consentStatus: 'EXPIRED', consentExpiresAt: '2099-01-01T00:00:00Z' }]);
    await settle(fixture, () => el.querySelectorAll('[data-testid=bank-account]').length === 1);
    expect(el.querySelector('[data-testid=bank-consent-note]')!.textContent!.trim()).toBe(
      'Consent expired — link your bank again.',
    );
  });

  it('the ASPSP copy comes from the environment (sandbox shows Nordea · Finland)', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BankConnectionCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_ENVIRONMENT, useValue: { ...TEST_ENV, bankName: 'Nordea', bankCountryLabel: 'Finland' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BankConnectionCard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    flushConnections([]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid=bank-status]')).not.toBeNull();
    });
    expect(el.textContent).toContain('Nordea · Finland — link to pull transactions');
  });

  it('Link your bank fetches GET /BankAuth/url?aspsp=Activo Bank&country=PT and redirects the whole tab', async () => {
    const { fixture, el } = make();
    flushConnections([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const go = vi.fn();
    const card = fixture.componentInstance as unknown as { go: (url: string) => void };
    card.go = go;

    el.querySelector<HTMLButtonElement>('[data-testid=link-bank]')!.click();
    await fixture.whenStable();
    const req = http.expectOne('https://api.test/BankAuth/url?aspsp=Activo%20Bank&country=PT');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    req.flush({ url: 'https://consent.enablebanking.com/...' });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(go).toHaveBeenCalledWith('https://consent.enablebanking.com/...');
  });

  it('the link button disables and spins while the consent URL request is in flight', async () => {
    const { fixture, el } = make();
    flushConnections([]);
    await fixture.whenStable();
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-testid=link-bank]')!.click();
    await fixture.whenStable();
    const req = http.expectOne('https://api.test/BankAuth/url?aspsp=Activo%20Bank&country=PT');
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('[data-testid=link-bank]')!.disabled).toBe(true);
    expect(el.querySelector('[data-testid=link-spinner]')).not.toBeNull();
    req.flush({ url: 'https://consent.enablebanking.com/...' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=link-spinner]')).toBeNull();
  });

  it('a failed consent-URL request surfaces an error line instead of redirecting', async () => {
    const { fixture, el } = make();
    flushConnections([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const go = vi.fn();
    (fixture.componentInstance as unknown as { go: (url: string) => void }).go = go;

    el.querySelector<HTMLButtonElement>('[data-testid=link-bank]')!.click();
    await fixture.whenStable();
    http
      .expectOne('https://api.test/BankAuth/url?aspsp=Activo%20Bank&country=PT')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(go).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid=bank-link-error]')).not.toBeNull();
  });
});
