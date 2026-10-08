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
  // White on an indigo gradient in both themes; the dark theme only deepens the gradient
  styles: `
    :host {
      position: relative;
      display: none;
      flex: 0 0 44%;
      flex-direction: column;
      justify-content: space-between;
      max-width: 640px;
      padding: 2.5rem 3rem;
      overflow: hidden;
      background:
        radial-gradient(60% 50% at 15% 10%, rgba(165, 180, 252, .55) 0, transparent 70%),
        radial-gradient(50% 45% at 90% 15%, rgba(192, 132, 252, .45) 0, transparent 70%),
        radial-gradient(70% 60% at 85% 100%, rgba(34, 211, 238, .35) 0, transparent 70%),
        linear-gradient(160deg, #4f46e5, #3730a3);
      color: #fff;

      @media (min-width: 992px) {
        display: flex;
      }
    }

    :host-context(.theme-dark) {
      background:
        radial-gradient(60% 50% at 15% 10%, rgba(129, 140, 248, .35) 0, transparent 70%),
        radial-gradient(50% 45% at 90% 15%, rgba(192, 132, 252, .25) 0, transparent 70%),
        radial-gradient(70% 60% at 85% 100%, rgba(34, 211, 238, .2) 0, transparent 70%),
        linear-gradient(160deg, #312e81, #1e1b4b);
    }

    // Faint grid over the gradient
    :host::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, .06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, .06) 1px, transparent 1px);
      background-size: 32px 32px;
      mask-image: radial-gradient(ellipse at 30% 40%, #000 20%, transparent 75%);
      pointer-events: none;
    }

    :host > * {
      position: relative;
    }

    .auth-aside-logo {
      align-self: flex-start;
      width: auto;
      height: 24px;
    }

    .auth-aside-title {
      max-width: 440px;
      margin-bottom: 1.75rem;
      color: #fff;
      font-size: 2rem;
      letter-spacing: -.02em;
      // Room above and below for Thai vowels and tone marks when the title wraps
      line-height: 1.4;
    }

    .auth-points {
      display: flex;
      flex-direction: column;
      gap: .875rem;
      margin: 0;
      padding: 0;
      color: rgba(255, 255, 255, .9);
      font-size: .9375rem;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        gap: .75rem;
      }
    }

    .auth-point-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, .2);
      border-radius: .625rem;
      background: rgba(255, 255, 255, .12);
      backdrop-filter: blur(6px);
      font-size: 1rem;
    }

    .auth-aside-footer {
      margin: 0;
      color: rgba(255, 255, 255, .65);
      font-size: .8125rem;
    }
  `,
})
export class AuthAsideComponent {
  protected readonly year = new Date().getFullYear();
}
