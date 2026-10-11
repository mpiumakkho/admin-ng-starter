import { expect, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

test('suspending someone asks why, and the activity log keeps the reason', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users?status=active&role=viewer');
  const row = page.locator('.users-table tbody tr').first();
  const name = (await row.locator('ui-person .ui-person-name, ui-person').first().innerText()).split('\n')[0].trim();
  await row.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Suspend' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Suspend');
  await expectAccessible(page, 'the reason dialog');
  // Required on a new installation: a blank one is refused in the dialog
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(dialog).toContainText('Give a reason. The activity log keeps it.');
  await dialog.getByLabel('Reason').fill('Left the company');
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Suspended');

  await page.goto('/activity');
  const entry = page.locator('.log tbody tr').first();
  await expect(entry).toContainText(name);
  await expect(entry.locator('.cell-reason')).toHaveText('“Left the company”');
  await entry.click();
  await expect(page.locator('dialog[open] .event-reason')).toContainText('Left the company');
});

test('the settings decide which changes need a reason', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  const reasons = page.getByRole('group', { name: 'Ask for a reason when' });
  await reasons.getByRole('checkbox', { name: 'Suspending or reactivating someone' }).uncheck();
  await reasons.getByRole('checkbox', { name: 'Taking a role away' }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');

  // Suspending goes ahead at once again
  await page.goto('/users?status=active&role=viewer');
  const rows = page.locator('.users-table tbody tr');
  await rows.first().getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Suspend' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('ui-toaster')).toContainText('Suspended');

  // Taking a role away from several people now needs one
  await page.goto('/users?role=viewer');
  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  await page.locator('ui-bulk-bar').getByRole('button', { name: 'Take role away' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('combobox', { name: 'Role', exact: true }).selectOption({ label: 'Viewer' });
  await dialog.getByRole('button', { name: 'Take role away' }).click();
  await expect(dialog).toContainText('Give a reason. The activity log keeps it.');
  await dialog.getByLabel('Reason').fill('Moved to another team');
  await dialog.getByRole('button', { name: 'Take role away' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Took the role away from 2 user(s)');
});
