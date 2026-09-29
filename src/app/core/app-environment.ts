import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** App-wide runtime config (env-selected at build time via fileReplacements). */
export const APP_ENVIRONMENT = new InjectionToken<Readonly<{
  production: boolean;
  googleClientId: string;
  apiBaseUrl: string;
}>>('APP_ENVIRONMENT', { factory: () => environment });
