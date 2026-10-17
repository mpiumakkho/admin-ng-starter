import { Routes } from '@angular/router';

import { AppointmentsComponent } from './pages/appointments.component';
import { DispenseComponent, OrdersComponent, ResultsComponent } from './pages/boards';
import { EncounterComponent } from './pages/encounter.component';
import { QueueComponent } from './pages/queue.component';
import { ClinicShellComponent } from './shell/clinic-shell.component';

/** The clinical workspace's tabs, under /clinic */
export const CLINIC_ROUTES: Routes = [
  {
    path: '',
    component: ClinicShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'queue' },
      { path: 'queue', component: QueueComponent },
      { path: 'appointments', component: AppointmentsComponent },
      { path: 'encounter', component: EncounterComponent },
      { path: 'orders', component: OrdersComponent },
      { path: 'results', component: ResultsComponent },
      { path: 'dispense', component: DispenseComponent },
      { path: '**', redirectTo: 'queue' },
    ],
  },
];
