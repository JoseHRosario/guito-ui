import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth-service';
import { SignIn } from './signin';

const auth = { signIn: vi.fn(async () => {}), isAuthenticated: vi.fn(() => false) };

beforeEach(() => {
  auth.signIn.mockClear();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
});

async function create(inputs: Record<string, string> = {}) {
  const fixture = TestBed.createComponent(SignIn);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('SignIn', () => {
  it('renders the logo, tagline and Google sign-in button', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="signin-logo"]')).toBeTruthy();
    expect(el.textContent).toContain('Personal expense tracker');
    expect(el.querySelector('[data-testid="signin-button"]')?.textContent).toMatch(/sign in with google/i);
    // Google G mark rides inside the button (approved Figma frame 3071:35).
    expect(el.querySelector('[data-testid="signin-button"] svg')).toBeTruthy();
  });

  it('starts the Google sign-in with the returnUrl from the query params', async () => {
    const fixture = await create({ returnUrl: '/expenses?month=2' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('[data-testid="signin-button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(auth.signIn).toHaveBeenCalledWith('/expenses?month=2');
  });

  it('defaults to / when no returnUrl is present', async () => {
    const fixture = await create();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="signin-button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(auth.signIn).toHaveBeenCalledWith('/');
  });

  it('never forwards an absolute or protocol-relative returnUrl to Google', async () => {
    const fixture = await create({ returnUrl: 'https://evil.example.com/steal' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="signin-button"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(auth.signIn).toHaveBeenCalledWith('/');
  });

  it('shows the trust line at the bottom', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="signin-legal"]')?.textContent).toMatch(/terms of service/i);
  });
});