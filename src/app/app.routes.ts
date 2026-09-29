import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/expenses-page';
import { AuthCallback } from './features/auth/auth-callback';
import { STUB_EXPENSES, STUB_MONTH_LABEL, STUB_SUMMARY } from './core/stub-expenses';

export const routes: Routes = [
  {
    path: '',
    component: ExpensesPage,
    title: 'Guito · Dashboard',
    data: { expenses: STUB_EXPENSES, summary: STUB_SUMMARY, month: STUB_MONTH_LABEL },
  },
  // OAuth redirect landing — must exist outside the future auth gate (ADR 0011).
  { path: 'auth/callback', component: AuthCallback, title: 'Guito · Signing in' },
  { path: '**', redirectTo: '' },
];
