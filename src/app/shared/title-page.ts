import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Title-only placeholder screen (issue #47): each shell-level section
 * (Dashboard / Budgets / Settings) starts as a bare page title until its real
 * screen is designed. The title arrives via the route's `data`.
 */
@Component({
  selector: 'g-title-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-full flex-col items-start gap-4 p-4 lg:px-12 lg:pt-10 lg:pb-16">
      <p class="text-2xl leading-normal font-semibold text-base-content" data-testid="page-title">{{ title() }}</p>
    </div>
  `,
})
export class TitlePage {
  readonly title = input('');
}
