import { expect, test } from '@playwright/test';

import { expectAccessible, menu, signInAs, start } from './helpers';

test('adds a branch, keeps each code once, closes it and deletes it', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.getByRole('button', { name: 'User management' }).click();
  await menu(page).filter({ hasText: 'Branches' }).click();
  await expect(page).toHaveURL(/\/branches$/);
  const rows = page.locator('.branches-table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Add branch' }).first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill('Khon Kaen');
  await dialog.getByLabel('Code').fill('kkc');
  await dialog.getByRole('button', { name: 'Add branch' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Added the branch Khon Kaen');
  const added = rows.filter({ hasText: 'Khon Kaen' });
  await expect(added).toContainText('KKC');
  await expect(added).toContainText('Open');

  // The code is unique, ignoring case
  await page.getByRole('button', { name: 'Add branch' }).first().click();
  await dialog.getByLabel('Name').fill('Khon Kaen 2');
  await dialog.getByLabel('Code').fill('KKC');
  await dialog.getByRole('button', { name: 'Add branch' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Another branch already has this code.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Search by code or name, and filter by status
  await page.getByPlaceholder('Search name or code').fill('kkc');
  await expect(rows).toHaveCount(1);
  await page.getByPlaceholder('Search name or code').fill('');
  await page.locator('ui-filter-chips button', { hasText: 'Closed' }).click();
  await expect(rows).toHaveText([/Pattaya/]);
  await page.locator('ui-filter-chips button', { hasText: 'All' }).click();

  await added.getByRole('button', { name: 'Actions for Khon Kaen' }).click();
  await page.getByRole('menuitem', { name: 'Close branch' }).click();
  await expect(added).toContainText('Closed');

  await added.getByRole('button', { name: 'Actions for Khon Kaen' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Deleted the branch Khon Kaen');
  await expect(added).toHaveCount(0);
});

test('lists the people of a branch, and gives a role for that branch only', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/branches');
  // The people count leads to the users list, filtered
  await page.locator('.branches-table tbody tr', { hasText: 'Phuket' }).locator('.count-link').click();
  await expect(page).toHaveURL(/\/users\?branch=b-hkt/);
  const rows = page.locator('.users-table tbody tr');
  await expect(rows.first()).toBeVisible();
  const branchCells = rows.locator('td', { hasText: /^\s*Phuket\s*$/ });
  await expect(branchCells).toHaveCount(await rows.count());

  await page.goto('/users?role=viewer');
  await rows.first().click();
  await page.getByRole('button', { name: /^Roles & permissions/ }).click();
  await page.getByRole('button', { name: 'Give role' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Applies in').selectOption({ label: 'Chiang Mai' });
  await dialog.getByRole('combobox', { name: 'Role', exact: true }).selectOption({ label: 'Support' });
  await dialog.getByRole('button', { name: 'Give role' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Role given.');

  const assignment = page.locator('.assignments .assignment', { hasText: 'Support' });
  await expect(assignment.locator('.assignment-scope')).toHaveText('Chiang Mai');
  await expect(page.locator('.assignments .assignment', { hasText: 'Viewer' }).locator('.assignment-scope')).toHaveText('Whole organization');
});

test('turning branches off hides them everywhere but their own page', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users');
  await expect(page.locator('.users-table thead')).toContainText('Branch');

  await page.goto('/settings');
  // The drawn track lies over the input; clicking it is clicking the label
  await page.getByRole('switch', { name: 'Use branches' }).uncheck({ force: true });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');
  await expect(menu(page).filter({ hasText: 'Branches' })).toHaveCount(0);

  await page.goto('/users');
  await expect(page.locator('.users-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.users-table thead')).not.toContainText('Branch');
  await expect(page.getByRole('combobox', { name: 'Branch' })).toHaveCount(0);

  await page.goto('/branches');
  await expect(page.locator('ui-alert')).toContainText('Branches are turned off');
});
