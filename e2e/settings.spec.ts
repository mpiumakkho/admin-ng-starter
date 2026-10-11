import { expect, Page, test } from '@playwright/test';

import { signInAs, signOut, start, totp } from './helpers';

async function saveSettings(page: Page) {
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');
}

async function openOwnSecurity(page: Page) {
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Security and devices' }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByRole('button', { name: 'Change password' }).click();
  const fields = page.locator('dialog[open] input[type=password]');
  await fields.nth(0).fill(current);
  await fields.nth(1).fill(next);
  await fields.nth(2).fill(next);
  await page.locator('dialog[open]').getByRole('button', { name: 'Change password' }).click();
}

/** Today in the browser's time zone, as a date input wants it */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

test('a role that must use two-step sign-in: nothing else opens until it is on', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  const roles = page.getByRole('group', { name: 'Two-step sign-in required for' });
  // Ticking your own role while yours is off would hold you back too: the page says so before saving
  const warning = page.locator('ui-alert', { hasText: 'Your own role is ticked' });
  await roles.getByRole('checkbox', { name: 'Administrator' }).check();
  await expect(warning).toBeVisible();
  await roles.getByRole('checkbox', { name: 'Administrator' }).uncheck();
  await expect(warning).toHaveCount(0);
  await roles.getByRole('checkbox', { name: 'Viewer' }).check();
  await saveSettings(page);
  await signOut(page);

  await signInAs(page, 'Viewer');
  await expect(page).toHaveURL('/setup-two-factor');
  await expect(page.locator('ui-empty-state')).toContainText('Your role, Viewer, requires two-step sign-in.');
  await page.goto('/users');
  await expect(page).toHaveURL('/setup-two-factor');

  await page.getByRole('button', { name: 'Turn on' }).click();
  const dialog = page.locator('dialog[open]');
  const secret = (await dialog.locator('.secret code').textContent())!.replace(/\s/g, '');
  await dialog.locator('input[autocomplete=one-time-code]').fill(totp(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(page).not.toHaveURL(/setup-two-factor/);
  await expect(page.locator('#sidebar')).toBeVisible();

  // It stays on: the role requires it
  await openOwnSecurity(page);
  await expect(page.locator('.security-row').first()).toContainText('Your role requires it.');
  await expect(page.locator('.security-row').first().getByRole('button', { name: 'Turn off' })).toHaveCount(0);
});

test('password rules: a longer shortest password, and no going back to a recent one', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  await page.locator('#passwordMinLength').selectOption({ label: '12 characters' });
  await page.locator('#passwordHistory').selectOption({ label: 'Not the last 3' });
  await saveSettings(page);

  await openOwnSecurity(page);
  await page.getByRole('button', { name: 'Change password' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('At least 12 characters.');
  const fields = dialog.locator('input[type=password]');
  await fields.nth(0).fill('any-password');
  await fields.nth(1).fill('short-pass1');
  await fields.nth(2).fill('short-pass1');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog).toContainText('Use at least 12 characters.');

  await fields.nth(1).fill('first-password-1');
  await fields.nth(2).fill('first-password-1');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Your password has been changed.');

  // The sample accounts take any password, so the first one remembered is the one just set
  await changePassword(page, 'first-password-1', 'second-password-2');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await changePassword(page, 'second-password-2', 'first-password-1');
  await expect(page.locator('ui-toaster')).toContainText('You used this password recently. Choose another one.');
});

test('gives several people a role at once, and takes it away again', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users?role=support');
  const rows = page.locator('.users-table tbody tr');
  await expect(rows.first()).toBeVisible();
  const pick = async () => {
    await rows.nth(0).getByRole('checkbox').check();
    await rows.nth(1).getByRole('checkbox').check();
  };

  await pick();
  await page.locator('ui-bulk-bar').getByRole('button', { name: 'Give role' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Give a role to 2 people');
  await dialog.locator('select').selectOption({ label: 'Compliance' });
  await dialog.getByRole('button', { name: 'Give role' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Gave the role to 2 user(s)');
  await expect(page.locator('ui-bulk-bar')).toHaveCount(0);
  // Each holds both roles now
  await expect(rows.nth(0).locator('app-role-badges')).toContainText('Compliance');
  await expect(rows.nth(1).locator('app-role-badges')).toContainText('Compliance');

  await pick();
  await page.locator('ui-bulk-bar').getByRole('button', { name: 'Take role away' }).click();
  await dialog.locator('select').selectOption({ label: 'Compliance' });
  await dialog.getByRole('button', { name: 'Take role away' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Took the role away from 2 user(s)');
  await expect(rows.nth(0).locator('app-role-badges')).not.toContainText('Compliance');
  await expect(rows.nth(1).locator('app-role-badges')).not.toContainText('Compliance');
});

test('gives a role for a time from the profile, and it shows when it ends', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users?role=viewer');
  await page.locator('.users-table tbody tr').first().click();
  await page.getByRole('button', { name: /^Roles & permissions/ }).click();

  const roles = page.locator('.assignments');
  await page.getByRole('button', { name: 'Give role' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Role').selectOption({ label: 'Contractor' });
  // Contractor must end within 90 days and needs a reason
  await expect(dialog.getByRole('button', { name: 'For good' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Give role' }).click();
  await expect(dialog.getByRole('alert')).toContainText('This role needs a reason.');
  await dialog.getByLabel('Reason').fill('Website project');
  await dialog.getByRole('button', { name: 'Give role' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Role given.');

  const contractor = roles.locator('.assignment', { hasText: 'Contractor' });
  await expect(contractor).toContainText('Active');
  await expect(contractor).toContainText('until');
  await expect(contractor).toContainText('Website project');

  // Taken away again, after asking
  await contractor.getByRole('button', { name: /Take away/ }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Take away' }).click();
  await expect(roles.locator('.assignment', { hasText: 'Contractor' })).toHaveCount(0);
});

test('the activity log between two dates, and exporting just that part', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/activity');
  await page.getByLabel('Time range').selectOption({ label: 'Pick dates' });
  await page.getByLabel('From', { exact: true }).fill(today());
  await page.getByLabel('To', { exact: true }).fill(today());
  const rows = page.locator('.log tbody tr');
  // Signing in just now is in today's part
  await expect(rows.first()).toContainText('Signed in');
  const count = await rows.count();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toBe('activity.csv');
  await expect(page.locator('ui-toaster')).toContainText(/Exported \d+ rows/);
  expect(count).toBeGreaterThan(0);

  await page.getByLabel('From', { exact: true }).fill('2001-01-01');
  await page.getByLabel('To', { exact: true }).fill('2001-01-02');
  await expect(page.locator('ui-empty-state')).toContainText('No activity found');
});
