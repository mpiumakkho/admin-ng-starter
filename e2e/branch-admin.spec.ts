import { expect, test } from '@playwright/test';

import { expectAccessible, menu, signInAs, start } from './helpers';

test('a branch manager looks after the people of their branch, and nobody else', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Branch manager');
  // Users and the activity log through the branch; the settings and the branches need a role for everyone
  await page.getByRole('button', { name: 'User management' }).click();
  await expect(menu(page).filter({ hasText: 'Users' })).toHaveCount(1);
  await expect(menu(page).filter({ hasText: 'Activity log' })).toHaveCount(1);
  await expect(menu(page).filter({ hasText: 'Settings' })).toHaveCount(0);
  await expect(menu(page).filter({ hasText: 'Branches' })).toHaveCount(0);

  await page.goto('/users');
  const search = page.getByPlaceholder('Search name, email or phone');
  const rows = page.locator('.users-table tbody tr');
  // In Chiang Mai, with a role no stronger than theirs: theirs to change
  await search.fill('Kittipong');
  await rows.first().getByRole('button', { name: 'Actions for Kittipong Sukjai' }).click();
  await expect(page.getByRole('menuitem', { name: /^Edit/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Suspend' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // At the head office: only their profile
  await search.fill('Henry Klein');
  await rows.first().getByRole('button', { name: 'Actions for Henry Klein' }).click();
  await expect(page.getByRole('menuitem', { name: 'View profile' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Edit/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectAccessible(page);

  // Someone new joins the branch, and gets the default role there
  await page.goto('/users/new');
  const branch = page.locator('#branchId');
  await expect(branch.locator('option')).toHaveText(['Chiang Mai']);
  await page.locator('#firstName').fill('Malee');
  await page.locator('#lastName').fill('Srisuk');
  await page.locator('#email').fill('malee.srisuk@example.com');
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page).toHaveURL(/\/users\/u-/);
  await page.getByRole('button', { name: /^Roles & permissions/ }).click();
  await expect(page.locator('.assignments .assignment', { hasText: 'Viewer' }).locator('.assignment-scope')).toHaveText('Chiang Mai');

  // Roles for the branch only, and only ones they hold there
  await page.getByRole('button', { name: 'Give role' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByLabel('Applies in').locator('option')).toHaveText(['Chiang Mai']);
  const roles = dialog.getByRole('combobox', { name: 'Role', exact: true }).locator('option');
  await expect(roles).toContainText(['Finance']);
  await expect(roles.filter({ hasText: 'Administrator' })).toHaveCount(0);
});
