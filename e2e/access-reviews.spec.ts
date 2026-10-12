import { expect, test } from '@playwright/test';

import { expectAccessible, menu, signInAs, start } from './helpers';

test('an administrator starts a review, decides, and closing it takes away the roles marked Remove', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  // The sample's review of Chiang Mai waits for them
  await expect(page.locator('.reviews-waiting')).toContainText('wait for your decision');
  await page.getByRole('link', { name: 'Review now' }).click();
  await expect(page).toHaveURL(/\/access-reviews$/);
  await expect(page.locator('.reviews-table tbody tr')).toHaveCount(2);
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Start review' }).first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill('Support check');
  await dialog.getByLabel('Roles').selectOption({ label: 'Support' });
  await expect(dialog.locator('.review-covers')).toContainText('This review covers');
  await dialog.getByRole('button', { name: 'Start review' }).click();
  await expect(page).toHaveURL(/\/access-reviews\/ar-/);
  await expect(page.getByRole('heading', { name: 'Support check' })).toBeVisible();

  const rows = page.locator('.review-table tbody tr');
  const first = rows.nth(0);
  const second = rows.nth(1);
  await first.getByRole('button', { name: 'Keep' }).click();
  await expect(first.getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'true');
  await second.getByRole('button', { name: 'Remove' }).click();
  const prompt = page.locator('dialog[open]');
  await prompt.getByLabel('Reason').fill('Moved to sales');
  await prompt.getByRole('button', { name: 'Remove' }).click();
  await expect(second.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toContainText('Moved to sales');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Close review' }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm).toContainText('1 roles marked Remove are taken away.');
  await confirm.getByRole('button', { name: 'Close review' }).click();
  await expect(page.getByText('Closed Support check.')).toBeVisible();
  await expect(first.locator('ui-badge', { hasText: 'Kept' })).toBeVisible();
  await expect(second.locator('ui-badge', { hasText: 'Removed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close review' })).toHaveCount(0);

  // The activity log says the server took it away, as the review decided
  await page.goto('/activity');
  await page.locator('ui-filter-chips button', { hasText: 'Access reviews' }).click();
  await expect(page.locator('tbody tr', { hasText: 'Closed access review' }).filter({ hasText: 'Support check' })).toBeVisible();
});

test('a branch manager decides about the people of their branch; a viewer has no reviews', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Branch manager');
  // The closed group says something waits inside it
  const group = page.getByRole('button', { name: 'User management' });
  await expect(group.locator('.menu-count')).toBeVisible();
  await group.click();
  await menu(page).filter({ hasText: 'Access reviews' }).click();
  const review = page.locator('.reviews-table tbody tr', { hasText: 'Chiang Mai, quarterly review' });
  await expect(review).toContainText('to decide');
  await review.getByRole('link').click();

  // What waits for them, which they cannot close
  const waiting = page.locator('ui-filter-chips button', { hasText: 'Waiting for you' });
  await waiting.click();
  await expect(page.getByRole('button', { name: 'Close review' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select all on this page' }).check();
  await page.locator('ui-bulk-bar').getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText(/^Keeping \d+ roles\.$/)).toBeVisible();
  await expect(waiting.locator('.ui-chip-count')).toHaveText('0');
  await expectAccessible(page);

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await signInAs(page, 'Viewer');
  await page.getByRole('button', { name: 'User management' }).click();
  await expect(menu(page).filter({ hasText: 'Access reviews' })).toHaveCount(0);
  await page.goto('/access-reviews');
  await expect(page.getByText(/have access to this page/)).toBeVisible();
});
