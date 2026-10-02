import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { APP_ENVIRONMENT } from './core/app-environment';
import { authInterceptor } from './core/auth/auth-interceptor';
import { provideWarmUp } from './core/warm-up/warm-up-initializer';
import { provideBfcacheGuard } from './core/auth/bfcache-guard-initializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideWarmUp(),
    provideBfcacheGuard(),
    { provide: APP_ENVIRONMENT, useValue: environment },
  ],
};
