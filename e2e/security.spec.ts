import { expect, test } from '@playwright/test';

import { signInAs, signOut, start, totp } from './helpers';

test('the header shows who is signed in and their role', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');

  await expect(page.locator('.user-button .user-role')).toHaveText('Manager');
  await expect(page.locator('#sidebar .nav-profile')).toHaveCount(0);
  await page.locator('.user-button').click();
  await expect(page.locator('.account-card')).toContainText('Manager');
});

test('two-step sign-in: turn it on with a code, then sign in with one', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Support');

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Security and devices' }).click();
  await page.getByRole('button', { name: 'Turn on' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('.qr img')).toBeVisible();
  const secret = (await dialog.locator('.secret code').textContent())!.replace(/\s/g, '');

  await dialog.locator('input[autocomplete=one-time-code]').fill('000000');
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog).toContainText('That code is not right.');
  await dialog.locator('input[autocomplete=one-time-code]').fill(totp(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Two-step sign-in is on.');
  // The recovery codes, shown this once
  await expect(dialog.locator('.recovery-codes code')).toHaveCount(10);
  await dialog.getByRole('button', { name: 'Done' }).click();

  await signOut(page);
  await page.locator('.demo-account', { hasText: 'Support' }).click();
  await expect(page.locator('#loginCode')).toBeFocused();
  await page.locator('#loginCode').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test('signs out of another device, and the other tab notices', async ({ context }) => {
  const first = await context.newPage();
  await start(first);
  await signInAs(first, 'Administrator');

  // A second tab shares the session, as a second window would
  const second = await context.newPage();
  await second.goto('/users');
  await expect(second.locator('.users-table')).toBeVisible();

  // Live updates: a change in one tab shows in the other without a reload
  await first.goto('/users/new');
  await first.locator('#firstName').fill('Live');
  await first.locator('#lastName').fill('Update');
  await first.locator('#email').fill('live.update@example.com');
  await first.getByRole('button', { name: 'Add user' }).click();
  await expect(first).toHaveURL(/\/users\/u-/);
  await second.locator('.toolbar-search input').fill('live.update');
  await expect(second.locator('.users-table tbody tr')).toHaveCount(1);

  await first.goto('/users/u-001?tab=security');
  const devices = first.locator('.device');
  await expect(devices.first()).toBeVisible();
  const count = await devices.count();
  await expect(first.locator('.device', { hasText: 'This device' })).toHaveCount(1);
  await first.getByRole('button', { name: 'Sign out of other devices' }).click();
  await first.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
  await expect(first.locator('ui-toaster')).toContainText('Signed out of your other devices.');
  await expect(devices).toHaveCount(1);
  expect(count).toBeGreaterThan(1);

  // Signing out in one tab ends the shared session; the other tab goes to sign-in on its own,
  // and signing in again starts at the overview
  await signOut(first);
  await expect(second).toHaveURL('/login?expired=ended');
  await second.locator('.demo-account', { hasText: 'Administrator' }).click();
  await expect(second).toHaveURL('/overview');
});
