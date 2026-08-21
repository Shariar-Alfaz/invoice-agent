import { registerLocaleData } from '@angular/common';
import localeJa from '@angular/common/locales/ja';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeJa);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
