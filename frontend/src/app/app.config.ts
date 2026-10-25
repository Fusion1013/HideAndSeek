import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideApi } from './api/generated/provide-api';

import { routes } from './app.routes';
import { accessTokenInterceptor } from './auth/access-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([accessTokenInterceptor])),
    provideApi(''),
    provideRouter(routes, withComponentInputBinding())
  ]
};
