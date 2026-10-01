import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { warmUpApi } from './warm-up';

/**
 * Registers a bootstrap initializer that warms the API Lambda (issue guito-ui#28).
 * Best-effort: never blocks startup and never surfaces errors.
 */
export function provideWarmUp(): EnvironmentProviders {
  return provideAppInitializer(() => {
    void warmUpApi(inject(APP_ENVIRONMENT).apiBaseUrl);
  });
}