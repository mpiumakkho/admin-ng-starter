import { expect, Page, test } from '@playwright/test';

import { signInAs, signOut, start } from './helpers';

/**
 * The links in emails. The sample data has no mail server: each email is written to the browser console, and the
 * link is read from there.
 */
function inbox(page: Page) {
  const emails: string[] = [];
  page.on('console', message => {
    if (message.text().startsWith('[sample email]')) {
      emails.push(message.text());
    }
  });
  return {
    /** The path and token of the last link sent to this address */
    async linkFor(email: string): Promise<string> {
      await expect.poll(() => emails.some(text => text.includes(`To ${email}:`))).toBe(true);
      const url = new URL([...emails].reverse().find(text => text.includes(`To ${email}:`))!.split(' ').at(-1)!);
      return url.pathname + url.search;
    },
    count: () => emails.length,
  };
}

test('forgot password: a link by email, a new password, then sign in with it', async ({ page }) => {
  const emails = inbox(page);
  await start(page);
  const email = (await page.locator('.demo-account', { hasText: 'Viewer' }).getAttribute('title'))!;

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL('/forgot-password');
  await page.locator('#resetEmail').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.locator('ui-alert')).toContainText(`If ${email} belongs to an account`);

  await page.goto(await emails.linkFor(email));
  await expect(page.locator('h4')).toHaveText('Set a new password');
  await page.locator('#newPassword').fill('new-password-1');
  await page.locator('#repeatPassword').fill('new-password-2');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('ui-form-field', { hasText: 'Repeat the new password' })).toContainText('The passwords do not match.');
  await page.locator('#repeatPassword').fill('new-password-1');
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page).toHaveURL('/login?password=changed');
  await expect(page.locator('ui-alert')).toHaveText('Your password has been changed. Sign in with the new one.');
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill('any-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('ui-alert')).toHaveText('Wrong email or password.');
  await page.locator('#loginPassword').fill('new-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test('an invitation: the new user sets a password and signs in', async ({ page }) => {
  const emails = inbox(page);
  await start(page);
  await signInAs(page, 'Administrator');

  await page.goto('/users/new');
  await page.locator('#firstName').fill('Invited');
  await page.locator('#lastName').fill('Person');
  await page.locator('#email').fill('invited.person@example.com');
  await page.locator('.ui-seg-option', { hasText: 'Invited' }).click();
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page).toHaveURL(/\/users\/u-/);
  await signOut(page);

  await page.locator('#loginEmail').fill('invited.person@example.com');
  await page.locator('#loginPassword').fill('any-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('ui-alert')).toContainText('has not been activated yet');

  const link = await emails.linkFor('invited.person@example.com');
  expect(link).toMatch(/^\/activate\?token=/);
  await page.goto(link);
  await expect(page.locator('h4')).toHaveText('Set your password');
  await page.locator('#newPassword').fill('first-password-1');
  await page.locator('#repeatPassword').fill('first-password-1');
  await page.getByRole('button', { name: 'Set password' }).click();

  await expect(page).toHaveURL('/login?password=set');
  await expect(page.locator('ui-alert')).toHaveText('Your password is set. Sign in to start.');
  await page.locator('#loginEmail').fill('invited.person@example.com');
  await page.locator('#loginPassword').fill('first-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // The link worked once
  await signOut(page);
  await page.goto(link);
  await page.locator('#newPassword').fill('other-password-1');
  await page.locator('#repeatPassword').fill('other-password-1');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.locator('ui-alert')).toHaveText('This invitation has expired or was already used. Ask an administrator to send a new one.');
});

test('a link that is cut short or no longer works says so', async ({ page }) => {
  const emails = inbox(page);
  await start(page, '/activate');
  await expect(page.locator('ui-alert')).toContainText('This link is not complete.');

  await page.goto('/reset-password?token=not-a-real-token');
  await page.locator('#newPassword').fill('new-password-1');
  await page.locator('#repeatPassword').fill('new-password-1');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('ui-alert')).toHaveText('This link has expired or was already used. Ask for a new one.');
  await page.getByRole('link', { name: 'Send a new link' }).click();
  await expect(page).toHaveURL('/forgot-password');

  // An address nobody has gets the same answer, and no email
  await page.locator('#resetEmail').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.locator('ui-alert')).toContainText('If nobody@example.com belongs to an account');
  expect(emails.count()).toBe(0);
});
