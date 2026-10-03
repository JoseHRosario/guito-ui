import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/pages/expenses-page';
import { CreateExpensePage } from './features/expenses/pages/create-expense-page';
import { SignIn } from './features/signin/pages/signin';
import { AuthCallback } from './features/auth/pages/auth-callback';
import { Shell } from './features/shell/components/shell';
import { TitlePage } from './shared/title-page';
import { authGuard, signedInGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  {
    // Shell chrome (header/nav/footer) wraps the app screens; auth routes render bare.
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        // The expense list IS the Expenses section (issue #47) — and the app's default route.
        // data.reuse marks it for the ExpensesRouteReuseStrategy: tab switches must NOT
        // reload it; the month-nav refresh button and the saved=1 path are the triggers.
        path: '',
        component: ExpensesPage,
        data: { reuse: true },
        title: 'Guito · Expenses',
      },
      {
        // Blank scaffolds (issue #47): title-only pages until the real screens are designed.
        path: 'dashboard',
        component: TitlePage,
        data: { title: 'Dashboard' },
        title: 'Guito · Dashboard',
      },
      {
        path: 'budgets',
        component: TitlePage,
        data: { title: 'Budgets' },
        title: 'Guito · Budgets',
      },
      {
        path: 'settings',
        component: TitlePage,
        data: { title: 'Settings' },
        title: 'Guito · Settings',
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
