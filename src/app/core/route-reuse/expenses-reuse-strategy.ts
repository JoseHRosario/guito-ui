import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Keeps the Expenses page alive across tab navigation (issue #47 follow-up):
 * leaving to Dashboard/Budgets/Settings detaches the component instead of
 * destroying it, so returning to the Expenses tab restores the loaded list
 * without re-issuing GET /Expense/latest/20. The list refreshes ONLY through
 * the month-nav refresh button or after an acknowledged expense creation/update/deletion.
 * Every other route is destroyed/recreated as usual.
 */
@Injectable({ providedIn: 'root' })
export class ExpensesRouteReuseStrategy implements RouteReuseStrategy {
  private handler: DetachedRouteHandle | null = null;

  hasDetachedRoute(): boolean {
    return this.handler !== null;
  }

  private static isReusable(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.data?.['reuse'] === true;
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return ExpensesRouteReuseStrategy.isReusable(route);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    this.handler = handle;
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return ExpensesRouteReuseStrategy.isReusable(route) && this.handler !== null;
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return ExpensesRouteReuseStrategy.isReusable(route) ? this.handler : null;
  }

  /** Create captures Bank intent once; a different query context must leave and recreate it. */
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig?.path === 'expenses/create' &&
      future.queryParamMap.get('bankTransactionId') !== curr.queryParamMap.get('bankTransactionId')) return false;
    return future.routeConfig === curr.routeConfig;
  }
}
