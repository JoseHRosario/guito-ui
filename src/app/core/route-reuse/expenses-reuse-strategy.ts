import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Keeps the Expenses page alive across tab navigation (issue #47 follow-up):
 * leaving to Dashboard/Budgets/Settings detaches the component instead of
 * destroying it, so returning to the Expenses tab restores the loaded list
 * without re-issuing GET /Expense/latest/20. The list refreshes ONLY through
 * the month-nav refresh button or after an expense creation (saved=1 path).
 * Every other route is destroyed/recreated as usual.
 */
@Injectable({ providedIn: 'root' })
export class ExpensesRouteReuseStrategy implements RouteReuseStrategy {
  private static handler: DetachedRouteHandle | null = null;

  static hasDetachedRoute(): boolean {
    return this.handler !== null;
  }

  private static isReusable(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.data?.['reuse'] === true;
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return ExpensesRouteReuseStrategy.isReusable(route);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    ExpensesRouteReuseStrategy.handler = handle;
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return ExpensesRouteReuseStrategy.isReusable(route) && ExpensesRouteReuseStrategy.handler !== null;
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return ExpensesRouteReuseStrategy.isReusable(route) ? ExpensesRouteReuseStrategy.handler : null;
  }

  /** Tab targets can never differ in matrix/query params today; keep future-proof anyway. */
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }
}
