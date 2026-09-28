import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { GIcon } from '../shared/gicon';

export interface NavItem {
  label: string;
  path: string;
  /** Placeholder sections render inert (no route yet in this stub). */
  enabled: boolean;
}

/** Unified nav labels (José's settled design): Dashboard/Expenses/Budgets/Settings. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', enabled: true },
  { label: 'Expenses', path: '/', enabled: false },
  { label: 'Budgets', path: '/', enabled: false },
  { label: 'Settings', path: '/', enabled: false },
];

@Component({
  selector: 'g-shell',
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GIcon],
})
export class Shell {
  protected readonly nav = NAV_ITEMS;
  /** lucide glyph per bottom-nav tab, index-aligned with NAV_ITEMS. */
  protected readonly tabIcons = ['credit-card', 'dollar-sign', 'shopping-bag', 'menu'] as const;

  /** Active tab paints with the primary token; the rest stay muted. */
  protected tabClass(label: string): string {
    const active = label === 'Dashboard';
    return (active ? 'text-primary' : 'text-base-content/60') + (active ? ' text-primary' : '');
  }
}
