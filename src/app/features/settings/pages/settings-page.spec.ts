import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_ENVIRONMENT } from '../../../core/app-environment';
import { ApiVersionService } from '../../../core/api-version/api-version-service';
import { SettingsPage } from './settings-page';

const STAMP = '0.1.0-beta.12+20261003T142230Z.1a2b3c4';
const TEST_ENV = {
  production: false,
  googleClientId: 'cid',
  apiBaseUrl: 'https://api.test',
  version: STAMP,
};

describe('SettingsPage', () => {
  function make(env = TEST_ENV, apiVersion?: string) {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: APP_ENVIRONMENT, useValue: env },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    const api = TestBed.inject(ApiVersionService);
    api.version.set(apiVersion);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the app version from the build stamp, semver prominent with the muted built line', () => {
    const fixture = make();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=app-semver]')!.textContent!.trim()).toBe('0.1.0-beta.12');
    expect(el.querySelector('[data-testid=app-meta]')!.textContent!.trim()).toBe('built 2026-10-03 14:22 UTC · 1a2b3c4');
  });

  it('shows the captured API version from the X-Api-Version header', () => {
    const fixture = make(TEST_ENV, '0.1.0-beta.170+20261003T150300Z.9f8e7d6');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=api-semver]')!.textContent!.trim()).toBe('0.1.0-beta.170');
    expect(el.querySelector('[data-testid=api-meta]')!.textContent!.trim()).toBe('built 2026-10-03 15:03 UTC · 9f8e7d6');
  });

  it('shows an unavailable line when the API version was never captured', () => {
    const fixture = make(TEST_ENV, undefined);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=api-version-unavailable]')).not.toBeNull();
    expect(el.querySelector('[data-testid=api-semver]')).toBeNull();
  });

  it('renders the version block without a built line when the stamp has no build metadata', () => {
    const fixture = make({ ...TEST_ENV, version: '1.2.3' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=app-semver]')!.textContent!.trim()).toBe('1.2.3');
    expect(el.querySelector('[data-testid=app-meta]')).toBeNull();
  });

  it('renders the Settings page title', () => {
    const fixture = make();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('Settings');
  });
});