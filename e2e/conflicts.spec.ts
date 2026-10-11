import { expect, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

test('the roles page leads to the rules and the people to fix', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/roles');
  const button = page.getByRole('link', { name: /Conflicting roles/ });
  // The sample has someone who held two roles of a rule before it was made
  await expect(button).toContainText('1');
  await button.click();
  await expect(page).toHaveURL(/\/roles\/conflicts$/);

  await expect(page.locator('.rules-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.fix-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.fix-table tbody tr')).toContainText('Auditors do not change accounts');
  await expectAccessible(page);
});

test('a new rule stops giving a role that cannot be held with one they hold', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/roles/conflicts');
  await page.getByRole('button', { name: 'Add rule' }).first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill('Viewers do not bill');
  const roles = dialog.getByRole('group', { name: 'Roles nobody may hold together' });
  await roles.getByRole('checkbox', { name: 'Viewer' }).check();
  // One role is not a rule
  await dialog.getByRole('button', { name: 'Add rule' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Pick at least two roles.');
  await roles.getByRole('checkbox', { name: 'Finance' }).check();
  await dialog.getByRole('button', { name: 'Add rule' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Added the rule Viewers do not bill');
  await expect(page.locator('.rules-table tbody tr', { hasText: 'Viewers do not bill' })).toContainText('Finance');

  await page.goto('/users?status=active&role=viewer');
  await page.locator('.users-table tbody tr').first().click();
  await page.getByRole('button', { name: /^Roles & permissions/ }).click();
  await page.getByRole('button', { name: 'Give role' }).click();
  const give = page.locator('dialog[open]');
  await give.getByRole('combobox', { name: 'Role', exact: true }).selectOption({ label: 'Finance' });
  await give.getByRole('button', { name: 'Give role' }).click();
  await expect(give.getByRole('alert')).toContainText('They hold Viewer, which cannot be held at the same time as this role (Viewers do not bill).');
});
