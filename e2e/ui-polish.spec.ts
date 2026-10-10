import { expect, test } from '@playwright/test';

import { signInAs, start } from './helpers';

test('the search shows people as you type, and the arrow keys pick one', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  const search = page.getByRole('combobox', { name: 'Search users' });
  await search.fill('somchai');
  const results = page.getByRole('listbox', { name: 'Search users' });
  await expect(results.getByRole('option').first()).toContainText('Somchai Jaidee');
  await expect(results.getByRole('option').last()).toContainText('See all 1 results in the users list');
  await expect(search).toHaveAttribute('aria-expanded', 'true');

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', 'quick-search-0');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/users\/u-/);
  await expect(page.locator('.profile-name')).toContainText('Somchai Jaidee');
  await expect(search).toHaveValue('');

  // Enter with nobody picked opens the whole list, filtered
  await search.fill('example.com');
  await search.press('Enter');
  await expect(page).toHaveURL('/users?q=example.com');

  await search.fill('nobody-by-this-name');
  await expect(page.locator('.search-empty')).toHaveText('No users found');
  await search.press('Escape');
  await expect(page.locator('.search-results')).toHaveCount(0);
});

test('the numbers on the filter chips follow the search', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users');
  const all = page.locator('ui-filter-chips button', { hasText: 'All' });
  await expect(all).toContainText('48');
  await page.locator('.toolbar-search input').fill('somchai');
  await expect(all).toContainText('1');

  await page.goto('/activity');
  const everything = page.locator('ui-filter-chips button', { hasText: 'All' });
  const before = await everything.locator('.ui-chip-count').textContent();
  await page.locator('.toolbar-search input').fill('nothing matches this');
  await expect(everything.locator('.ui-chip-count')).toHaveText('0');
  expect(Number(before)).toBeGreaterThan(0);
});

test('with less motion asked for, pages change without a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users');
  await page.locator('#sidebar a.nav-link', { hasText: 'Activity log' }).click();
  await expect(page).toHaveURL('/activity');
  expect(await page.locator('.page').evaluate(element => element.getAnimations().length)).toBe(0);
  await expect(page.locator('.page')).toHaveCSS('opacity', '1');
});

test('how long the app waits before signing out is said once, and in the account menu', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  await page.locator('#sessionTimeoutMinutes').selectOption({ label: '15 minutes' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('ui-toaster')).toContainText('You are signed out after 15 minutes without activity.');

  await page.locator('.user-button').click();
  await expect(page.locator('.account-card')).toContainText('You are signed out after 15 minutes without activity.');
});

test('the tabs of a profile never scroll up and down, and their focus ring is whole', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users/u-002');
  const tabs = page.locator('.profile .tabs');
  await expect(tabs).toBeVisible();
  expect(await tabs.evaluate(element => element.scrollHeight - element.clientHeight)).toBe(0);

  // The ring is drawn inside the tab, where the row's sideways scrolling does not cut it off
  await page.getByRole('button', { name: /^Details/ }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Permissions/ })).toHaveCSS('outline-offset', '-2px');
});
