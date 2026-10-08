import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { AdminApi, AdminApiError } from '../../user-management/data/admin-api';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let api: { requestPasswordReset: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = { requestPasswordReset: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    await fixture.whenStable();
  });

  async function send(email: string) {
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector<HTMLInputElement>('#resetEmail')!;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
  }

  it('asks for a reset link and says the same whoever the email belongs to', async () => {
    await send('ann@example.com');
    expect(api.requestPasswordReset).toHaveBeenCalledWith('ann@example.com');
    expect(fixture.nativeElement.querySelector('ui-alert').textContent).toContain('resetLinkSent');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('does not send an address that is not an email', async () => {
    await send('not an email');
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('says when there were too many attempts', async () => {
    api.requestPasswordReset.mockRejectedValue(new AdminApiError('too_many_requests'));
    await send('ann@example.com');
    expect(fixture.nativeElement.textContent).toContain('Too many attempts.');
  });
});
