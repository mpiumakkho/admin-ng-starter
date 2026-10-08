import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { AdminApi, AdminApiError } from '../../user-management/data/admin-api';
import { SetPasswordComponent } from './set-password.component';

describe('SetPasswordComponent', () => {
  let fixture: ComponentFixture<SetPasswordComponent>;
  let api: { acceptInvitation: ReturnType<typeof vi.fn>; confirmPasswordReset: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = { acceptInvitation: vi.fn(), confirmPasswordReset: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SetPasswordComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(SetPasswordComponent);
  });

  function fill(password: string, repeat: string) {
    const element: HTMLElement = fixture.nativeElement;
    for (const [id, value] of [['newPassword', password], ['repeatPassword', repeat]]) {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  }

  it('says when the link has no token', async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('This link is not complete.');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('accepts an invitation, and does not send passwords that do not match', async () => {
    fixture.componentRef.setInput('token', 'invite-token');
    await fixture.whenStable();
    fill('first-password-1', 'something-else');
    await fixture.whenStable();
    expect(api.acceptInvitation).not.toHaveBeenCalled();

    fill('first-password-1', 'first-password-1');
    await fixture.whenStable();
    expect(api.acceptInvitation).toHaveBeenCalledWith('invite-token', 'first-password-1');
  });

  it('offers a new link when a reset link no longer works', async () => {
    api.confirmPasswordReset.mockRejectedValue(new AdminApiError('invalid_token'));
    fixture.componentRef.setInput('token', 'used-token');
    fixture.componentRef.setInput('link', 'reset');
    await fixture.whenStable();
    fill('new-password-1', 'new-password-1');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('This link has expired or was already used.');
    expect(fixture.nativeElement.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });
});
