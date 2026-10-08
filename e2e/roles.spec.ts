import { expect, Page, test } from '@playwright/test';

import { signInAs, start } from './helpers';

async function createRole(page: Page, name: string) {
  await page.getByRole('button', { name: 'New role' }).click();
  await page.locator('#newRoleName').fill(name);
  await page.locator('dialog[open]').getByRole('button', { name: 'Create role' }).click();
  await expect(page.locator('#roleName')).toHaveValue(name);
}

test('a long role list scrolls in its card, keeps the role being edited in sight, and can be searched', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/roles');
  const list = page.locator('.role-panel');
  await expect(list).toContainText('14 roles');
  await expect(list.locator('.role-item')).toHaveCount(14);
  await expect(list.locator('.role-item').last()).not.toBeInViewport();

  // A new role goes at the end of the list, which scrolls to it
  await createRole(page, 'Partner');
  await expect(list).toContainText('15 roles');
  await expect(list.locator('.role-item.active')).toContainText('Partner');
  await expect(list.locator('.role-item.active')).toBeInViewport();

  const search = list.locator('.role-search input');
  await search.fill('fin');
  await expect(list.locator('.role-item')).toHaveText([/Finance/]);
  await search.fill('nothing like this');
  await expect(list).toContainText('No roles match your search.');
  await search.fill('');
  await expect(list.locator('.role-item')).toHaveCount(15);
});

test('on a phone a dropdown picks the role, and waits while there are unsaved changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/roles');
  await expect(page.locator('.role-panel')).toBeHidden();

  const picker = page.locator('#rolePicker');
  await picker.selectOption('support');
  await expect(page).toHaveURL(/role=support/);
  await expect(page.locator('#roleName')).toHaveValue('Support');

  await page.locator('#roleDescription').fill('Changed but not saved');
  await picker.selectOption('viewer');
  await expect(page.locator('ui-toaster')).toContainText('Save or discard your changes first.');
  await expect(picker).toHaveValue('support');
  await expect(page.locator('#roleName')).toHaveValue('Support');
});
