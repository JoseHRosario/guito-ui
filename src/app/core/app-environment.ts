import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** App-wide runtime config (env-selected at build time via fileReplacements). */
export const APP_ENVIRONMENT = new InjectionToken<Readonly<{
  production: boolean;
  googleClientId: string;
  apiBaseUrl: string;
  /** Build-stamped version (issue #49): CI substitutes deploy/version.sh's
   *  stamp for the 0.0.0-dev placeholder at build time; local builds keep it. */
  version: string;
}>>('APP_ENVIRONMENT', { factory: () => environment });
