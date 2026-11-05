import { ApplicationConfig, inject, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { APP_BASE_PATH } from './api/app-base-path';
import { BASE_PATH } from './api/generated/variables';

import { routes } from './app.routes';
import { accessTokenInterceptor } from './auth/access-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([accessTokenInterceptor])),
    // The API is under the same path as the app: /api at the site root, /hideandseek/api when hosted there
    { provide: BASE_PATH, useFactory: () => inject(APP_BASE_PATH) },
    provideRouter(routes, withComponentInputBinding()),
    // Makes the app installable and receives its notifications; the development server has no service worker
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })
  ]
};
