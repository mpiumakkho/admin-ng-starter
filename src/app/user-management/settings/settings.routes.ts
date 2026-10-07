import { Routes } from '@angular/router';

import { requirePermission } from '../access/guards';
import { confirmLeaveSettings, SettingsComponent } from './settings.component';

export const SETTINGS_ROUTES: Routes = [
  { path: '', component: SettingsComponent, canActivate: [requirePermission('settings.view')], canDeactivate: [confirmLeaveSettings] },
];
