import '@angular/compiler';
import { NgZone } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { routes } from './app.routes';

describe('App shell + expenses list (stubbed)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter(routes)] }).compileComponents();
    const router = TestBed.inject(Router);
    await TestBed.inject(NgZone).run(() => router.navigateByUrl('/'));
  });

  it('renders the shell header with the Guito wordmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Guito');
    expect(el.querySelector('nav[aria-label="Bottom navigation"]')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
  });

  it('renders the stubbed expense list grouped by day with formatted amounts', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // jsdom applies no CSS: both mobile and desktop branches render, so everything appears twice.
    const headers = [...el.querySelectorAll('[data-testid="group-header"]')].map((n) => n.textContent?.trim());
    expect(headers.slice(0, 2)).toEqual(['Jan 03, Sunday', 'Jan 02, Saturday']);
    expect(headers.length).toBe(4);
    const rows = el.querySelectorAll('[data-testid="expense-row"]');
    expect(rows.length).toBe(14);
    expect(el.textContent).toContain('65,55');
    // pt-PT has minimumGroupingDigits=2, so Intl does not group 4853.72 (frame shows hand-typed "4.853,72").
    expect(el.textContent).toContain('4853,72');
  });
});
