import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash location: funciona em qualquer hospedagem estática (GitHub Pages, S3...) sem rewrites.
    provideRouter(routes, withHashLocation()),
  ],
};
