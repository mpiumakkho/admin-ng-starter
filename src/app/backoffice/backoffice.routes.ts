import { Routes } from '@angular/router';

import { ActivityComponent } from './pages/home/activity.component';
import { AlertsComponent } from './pages/home/alerts.component';
import { ApprovalsComponent } from './pages/home/approvals.component';
import { OverviewComponent } from './pages/home/overview.component';
import { BackofficeShellComponent } from './shell/backoffice-shell.component';

/** The back office's pages, under /backoffice, by the spec's menu groups (shell/nav.ts) */
export const BACKOFFICE_ROUTES: Routes = [
  {
    path: '',
    component: BackofficeShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home/overview' },
      { path: 'home', pathMatch: 'full', redirectTo: 'home/overview' },
      { path: 'home/overview', component: OverviewComponent },
      { path: 'home/approvals', component: ApprovalsComponent },
      { path: 'home/alerts', component: AlertsComponent },
      { path: 'home/activity', component: ActivityComponent },
      { path: '**', redirectTo: 'home/overview' },
    ],
  },
];
