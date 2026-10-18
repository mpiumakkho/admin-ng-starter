import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideNgIconsConfig } from '@ng-icons/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateMultiHttpLoader } from '@ngx-translate/http-loader';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { FALLBACK_LANGUAGE } from './layout/language.service';
import { HttpAdminApi, provideUserManagement } from './user-management';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Scroll to top after route change
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withComponentInputBinding()),
    provideHttpClient(),
    provideTranslateService({
      // The app's own text, then user management's (copied to assets/i18n/user-management by angular.json)
      loader: provideTranslateMultiHttpLoader({ resources: ['./assets/i18n/', './assets/i18n/user-management/'] }),
      fallbackLang: FALLBACK_LANGUAGE,
    }),
    // Lucide icons, drawn a little finer than their default 2px stroke
    provideNgIconsConfig({ strokeWidth: 1.75 }),
    // Users, roles and activity; the session is picked up before the first screen. The production build reads them from
    // the server, such as ../admin-api-starter, at /api on the app's own origin (npm start forwards /api to port 8080,
    // proxy.conf.json; see user-management/API.md). npm start and npm run build:demo use sample data kept in the browser.
    environment.sampleData ? provideUserManagement() : provideUserManagement({ api: HttpAdminApi, apiUrl: '/api', liveUpdates: true }),
  ],
};
