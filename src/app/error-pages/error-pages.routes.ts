import { Routes } from '@angular/router';
import { Error404Component } from './error404/error404.component';
import { Error500Component } from './error500/error500.component';

export const ERROR_PAGES_ROUTES: Routes = [
  { path: '404', component: Error404Component },
  { path: '500', component: Error500Component },
];
