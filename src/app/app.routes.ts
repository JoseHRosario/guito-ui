import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/pages/expenses-page';
import { EditExpensePage } from './features/expenses/pages/edit-expense-page';
import { CreateExpensePage } from './features/expenses/pages/create-expense-page';
import { SignIn } from './features/signin/pages/signin';
import { AuthCallback } from './features/auth/pages/auth-callback';
import { Shell } from './features/shell/components/shell';
import { TitlePage } from './shared/title-page';
import { SettingsPage } from './features/settings/pages/settings-page';
import { BankPage } from './features/bank/pages/bank-page';
import { authGuard, signedInGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  { path: 'auth/renew', component: AuthCallback, data: { renew: true }, title: 'Guito · Reconnecting' },
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
        // Bank review: every visit reads authoritative transactions/history,
        // including return from atomic create-and-match.
        path: 'bank',
        component: BankPage,
        title: 'Guito · Bank',
      },
      {
        path: 'settings',
        component: SettingsPage,
        title: 'Guito · Settings',
      },
      {
        path: 'expenses/:id/edit',
        component: EditExpensePage,
        canDeactivate: [(page: EditExpensePage, _route, _state, next) => isAuthRecovery(next?.url) || page.canLeave()],
        title: 'Guito · Edit Expense',
      },
      {
        path: 'expenses/create',
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        component: CreateExpensePage,
        canDeactivate: [(page: CreateExpensePage, _route, _state, next) => isAuthRecovery(next?.url) || page.canLeave()],
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

function isAuthRecovery(url: string | undefined): boolean {
  return url?.split('?')[0] === '/signin' || url?.split('?')[0] === '/auth/renew';
}
