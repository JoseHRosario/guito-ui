import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/pages/expenses-page';
import { CreateExpensePage } from './features/expenses/pages/create-expense-page';
import { SignIn } from './features/signin/pages/signin';
import { AuthCallback } from './features/auth/pages/auth-callback';
import { Shell } from './features/shell/components/shell';
import { authGuard, signedInGuard } from './core/auth/auth-guard';

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
      },
      {
        path: 'expenses/create',
        component: CreateExpensePage,
        title: 'Guito · Create Expense',
      },
    ],
  },
  // OAuth redirect landing — must exist outside the auth gate (ADR 0011);
  // an already-authenticated visitor is sent to the root, never back into the
  // exchange (issue #36: stale callback history entries, PWA cold start).
  {
    path: 'auth/callback',
    component: AuthCallback,
    canActivate: [signedInGuard],
    title: 'Guito · Signing in',
  },
  {
    path: 'signin',
    component: SignIn,
    canActivate: [signedInGuard],
    title: 'Guito · Sign in',
  },
  // Unknown URLs redirect to '' which is auth-gated itself — the guard still applies.
  { path: '**', redirectTo: '' },
];
