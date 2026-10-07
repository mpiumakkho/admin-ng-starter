import { expect, Page, test } from '@playwright/test';

import { signInAs, start } from './helpers';

/** The "Done by" name and target of every row on the page */
async function rows(page: Page) {
  return page.locator('.log tbody tr').evaluateAll(trs => trs.map(tr => tr.textContent ?? ''));
}

test('the account menu opens your own activity, and the cross shows everyone\'s again', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');
  const name = (await page.locator('.user-button .user-name').textContent())!.trim();

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'My activity' }).click();
  await expect(page).toHaveURL(/\/activity\?user=u-/);
  await expect(page.locator('.subject-chip')).toContainText(name);
  await expect(page.locator('ui-page-header')).toContainText(`Changes made by or to ${name}.`);
  // Signing in just now is the newest entry, and every row is about this person
  await expect(page.locator('.log tbody tr').first()).toContainText(name);
  for (const text of await rows(page)) {
    expect(text).toContain(name);
  }
  const mine = await page.locator('ui-page-size').first().textContent();

  await page.getByRole('button', { name: "Show everyone's activity" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.locator('.subject-chip')).toHaveCount(0);
  await expect(page.locator('ui-page-size').first()).not.toHaveText(mine!);
});

test('a profile opens the log for that person', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users/u-002');
  const name = (await page.locator('.profile-name').textContent())!.replace('You', '').trim();

  await page.getByRole('button', { name: /^Activity/ }).click();
  await page.getByRole('link', { name: 'View in activity log' }).click();
  await expect(page).toHaveURL('/activity?user=u-002');
  await expect(page.locator('.subject-chip')).toContainText(name);
  for (const text of await rows(page)) {
    expect(text).toContain(name);
  }
});
