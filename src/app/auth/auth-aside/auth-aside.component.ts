import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHistory, lucideShieldCheck, lucideUsers } from '@ng-icons/lucide';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Brand panel beside the sign-in form. Hidden on small screens.
 */
@Component({
  selector: 'app-auth-aside',
  imports: [NgIcon, TranslatePipe],
  viewProviders: [provideIcons({ lucideHistory, lucideShieldCheck, lucideUsers })],
  host: { class: 'auth-aside' },
  template: `
    <img src="assets/images/logo.svg" alt="logo" class="auth-aside-logo">
    <div class="auth-aside-body">
      <h2 class="auth-aside-title">{{ 'Manage your users, roles and permissions in one place.' | translate }}</h2>
      <ul class="auth-points">
        <li><span class="auth-point-icon"><ng-icon name="lucideUsers" /></span>{{ 'Add, invite and suspend users' | translate }}</li>
        <li><span class="auth-point-icon"><ng-icon name="lucideShieldCheck" /></span>{{ 'Decide what each role can do' | translate }}</li>
        <li><span class="auth-point-icon"><ng-icon name="lucideHistory" /></span>{{ 'See every change in the activity log' | translate }}</li>
      </ul>
    </div>
    <p class="auth-aside-footer">© {{ year }} Admin Dashboard</p>
  `,
})
export class AuthAsideComponent {
  protected readonly year = new Date().getFullYear();
}
