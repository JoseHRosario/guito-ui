import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { APP_ENVIRONMENT } from '../app-environment';
import { ApiVersionService } from '../api-version/api-version-service';
import { warmUpApi } from './warm-up';

/**
 * Registers a bootstrap initializer for the single anonymous `GET /warm`
 * (issue #59, José review): the call warms the API container (and fires the
 * server-side Postgres wake) AND its `X-Api-Version` response header feeds
 * the Settings page via ApiVersionService — one request, both jobs; no
 * separate version-capture fetch. Best-effort: never blocks startup and
 * never surfaces errors (a failed warm leaves the version signal undefined).
 */
export function provideWarmUp(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const apiVersions = inject(ApiVersionService);
    void warmUpApi(inject(APP_ENVIRONMENT).apiBaseUrl).then((res) => {
      if (res) apiVersions.captureFromResponse(res);
    });
  });
}
