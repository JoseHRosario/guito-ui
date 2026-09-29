import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/expenses-page';
import { SignIn } from './features/signin/signin';
import { AuthCallback } from './features/auth/auth-callback';
import { Shell } from './shell/shell';
import { authGuard } from './core/auth/auth-guard';
import { STUB_EXPENSES, STUB_MONTH_LABEL, STUB_SUMMARY } from './core/stub-expenses';

export const routes: Routes = [
  {
    // Shell chrome (header/nav/footer) wraps the app screens; auth routes render bare.
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        component: ExpensesPage,
        title: 'Guito · Dashboard',
        data: { expenses: STUB_EXPENSES, summary: STUB_SUMMARY, month: STUB_MONTH_LABEL },
      },
    ],
  },
  // OAuth redirect landing — must exist outside the auth gate (ADR 0011).
  { path: 'auth/callback', component: AuthCallback, title: 'Guito · Signing in' },
  { path: 'signin', component: SignIn, title: 'Guito · Sign in' },
  // Unknown URLs redirect to '' which is auth-gated itself — the guard still applies.
  { path: '**', redirectTo: '' },
];
