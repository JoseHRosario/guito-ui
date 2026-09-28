import { Routes } from '@angular/router';
import { ExpensesPage } from './features/expenses/expenses-page';
import { STUB_EXPENSES, STUB_MONTH_LABEL, STUB_SUMMARY } from './core/stub-expenses';

export const routes: Routes = [
  {
    path: '',
    component: ExpensesPage,
    title: 'Guito · Dashboard',
    data: { expenses: STUB_EXPENSES, summary: STUB_SUMMARY, month: STUB_MONTH_LABEL },
  },
  { path: '**', redirectTo: '' },
];
