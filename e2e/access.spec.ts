import { expect, test } from '@playwright/test';

import { menu, signInAs, signOut, start } from './helpers';

test('a page sends people who are not signed in to sign in, and back afterwards', async ({ page }) => {
  await start(page, '/users?status=invited');
  await expect(page).toHaveURL('/login?returnUrl=%2Fusers%3Fstatus%3Dinvited');

  await page.locator('#loginEmail').fill('nobody@example.com');
  await page.locator('#loginPassword').fill('abcdef');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('ui-alert')).toHaveText('Wrong email or password.');

  await signInAs(page, 'Viewer');
  await expect(page).toHaveURL('/users?status=invited');
});

test('signing in starts at the overview, the first time and again after signing out', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');
  await expect(page).toHaveURL('/overview');

  await page.goto('/roles');
  await signOut(page);
  await signInAs(page, 'Manager');
  await expect(page).toHaveURL('/overview');
  await expect(menu(page).first()).toHaveText('Overview');
});

test('the menu group opens like a dropdown, its chevron turning clockwise', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  const group = page.locator('#sidebar .nav-group > .nav-link');
  const arrow = page.locator('#sidebar .nav-group .menu-arrow');

  // On the overview, outside the group, it starts closed; its pages cannot be reached by keyboard
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sidebar .sub-menu-wrap')).toHaveAttribute('inert', '');
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(arrow).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  await page.locator('#sidebar .sub-menu .nav-link', { hasText: 'Users' }).click();
  await expect(page).toHaveURL('/users');
  await group.click();
  await expect(arrow).toHaveCSS('transform', 'none');
});

test('a viewer sees users and roles, and can change nothing', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Viewer');

  await expect(menu(page)).toHaveText(['Overview', 'Users', 'Roles & permissions']);
  await page.goto('/users');
  await expect(page.getByRole('link', { name: 'Add user' })).toHaveCount(0);
  await expect(page.locator('.users-table ui-checkbox')).toHaveCount(0);
  await page.locator('.cell-actions button').first().click();
  await expect(page.getByRole('menuitem')).toHaveText(['View profile']);
  await page.keyboard.press('Escape');

  // The address stays, so it is clear what was refused
  await page.goto('/activity');
  await expect(page.locator('app-no-access')).toContainText("You don't have access to this page");
  await expect(page).toHaveURL('/activity');

  await page.goto('/roles');
  await expect(page.locator('.editor-note')).toContainText('view roles but not change them');
  await expect(page.locator('.matrix input[type=checkbox]:not(:disabled)')).toHaveCount(0);
});

test('a manager cannot give out or manage the Administrator role', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');

  // Only roles within their own permissions are offered
  await page.goto('/users/new');
  await page.getByRole('button', { name: 'Add a role' }).click();
  const roles = page.locator('dialog[open]').getByLabel('Role');
  await expect(roles.locator('option', { hasText: 'Administrator' })).toHaveCount(0);
  await expect(roles.locator('option', { hasText: 'Support' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.goto('/users/u-001');
  await expect(page.locator('.profile-actions')).toHaveCount(0);
  await page.goto('/users/u-001/edit');
  await expect(page.locator('app-no-access')).toBeVisible();
});

test('nobody changes their own role, status or role permissions', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');

  // Their role is built in: its permissions come from the system
  await page.goto('/roles?role=admin');
  await expect(page.locator('.editor-note')).toContainText('Built-in roles');
  await expect(page.locator('.matrix .ui-check-input').first()).toBeDisabled();
  await page.goto('/users/u-001/edit');
  await expect(page.locator('ui-alert')).toContainText('your own role or status');
  await expect(page.getByRole('link', { name: 'Change roles on the profile' })).toHaveCount(0);
  await page.goto('/users/u-001?tab=roles');
  await expect(page.locator('.assignments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Give role' })).toHaveCount(0);
});

test('signing out with unsaved changes asks first', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  await page.locator('#allowedDomains').fill('example.com');

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.locator('#allowedDomains')).toHaveValue('example.com');

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL('/login');
});

test('everyone edits their own profile and password', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Viewer');

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'My Profile' }).click();
  await page.getByRole('link', { name: 'Edit profile' }).click();
  await expect(page.locator('#email')).toBeDisabled();
  await page.locator('#phone').fill('0899990000');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.profile-meta')).toContainText('0899990000');

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Security and devices' }).click();
  await page.getByRole('button', { name: 'Change password' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('[formcontrolname=current]').fill('whatever1');
  await dialog.locator('[formcontrolname=next]').fill('brand-new-pass');
  await dialog.locator('[formcontrolname=repeat]').fill('brand-new-pass');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Your password has been changed.');

  await signOut(page);
  await page.locator('.demo-account', { hasText: 'Viewer' }).click();
  await expect(page.locator('ui-alert')).toHaveText('Wrong email or password.');
  await page.locator('#loginPassword').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
});
