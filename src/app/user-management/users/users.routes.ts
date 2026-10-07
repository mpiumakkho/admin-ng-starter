import { Routes } from '@angular/router';

import { canEditUser, canViewUser, requirePermission } from '../access/guards';
import { UserDetailComponent } from './user-detail.component';
import { confirmLeaveUserForm, UserFormComponent } from './user-form.component';
import { UsersListComponent } from './users-list.component';

export const USERS_ROUTES: Routes = [
  { path: '', component: UsersListComponent, canActivate: [requirePermission('users.view')] },
  { path: 'new', component: UserFormComponent, canActivate: [requirePermission('users.create')], canDeactivate: [confirmLeaveUserForm] },
  { path: ':id', component: UserDetailComponent, canActivate: [canViewUser] },
  { path: ':id/edit', component: UserFormComponent, canActivate: [canEditUser], canDeactivate: [confirmLeaveUserForm] },
];
