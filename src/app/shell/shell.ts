import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth-service';
import { GIcon, type IconName } from '../shared/gicon';

export interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  /** Placeholder sections render inert (no route yet in this stub). */
  enabled: boolean;
}

/** Unified nav labels (José's settled design): Dashboard/Expenses/Budgets/Settings. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'credit-card', enabled: true },
  { label: 'Expenses', path: '/', icon: 'dollar-sign', enabled: false },
  { label: 'Budgets', path: '/', icon: 'shopping-bag', enabled: false },
  { label: 'Settings', path: '/', icon: 'menu', enabled: false },
];

@Component({
  selector: 'g-shell',
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GIcon],
})
export class Shell {
  private readonly auth = inject(AuthService);

  protected readonly nav = NAV_ITEMS;
  protected readonly isAuthenticated = this.auth.isAuthenticated;

  /** Active tab paints with the primary token; the rest stay muted. */
  protected tabClass(label: string): string {
    return label === 'Dashboard' ? 'text-primary' : 'text-base-content/60';
  }
}
