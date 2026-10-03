import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { ApiVersionService } from './api-version-service';

/**
 * Registers a bootstrap initializer that captures the API build version once
 * (issue #51): anonymous GET {apiBaseUrl}/healthz, read the X-Api-Version
 * header. Fire-and-forget: never blocks startup, never surfaces errors.
 */
export function provideApiVersion(): EnvironmentProviders {
  return provideAppInitializer(() => {
    void inject(ApiVersionService).capture(inject(APP_ENVIRONMENT).apiBaseUrl);
  });
}
