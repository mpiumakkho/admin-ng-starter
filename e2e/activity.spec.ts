import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** The "Done by" name and target of every row on the page */
async function rows(page: Page) {
  return page.locator('.log tbody tr').evaluateAll(trs => trs.map(tr => tr.textContent ?? ''));
}

test('the account menu opens your own activity, and the cross on "About" shows everyone\'s again', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');
  const name = (await page.locator('.user-button .user-name').textContent())!.trim();

  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'My activity' }).click();
  await expect(page).toHaveURL(/\/activity\?user=u-/);
  await expect(page.getByRole('button', { name: `About: ${name}` })).toBeVisible();
  await expect(page.locator('ui-page-header')).toContainText(`Changes made by or to ${name}.`);
  // Signing in just now is the newest entry, and every row is about this person
  await expect(page.locator('.log tbody tr').first()).toContainText(name);
  for (const text of await rows(page)) {
    expect(text).toContain(name);
  }
  const mine = await page.locator('ui-page-size').first().textContent();

  await page.getByRole('button', { name: 'Clear About' }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole('button', { name: 'About: Anyone' })).toBeFocused();
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
  await expect(page.getByRole('button', { name: `About: ${name}` })).toBeVisible();
  for (const text of await rows(page)) {
    expect(text).toContain(name);
  }
});

test('"Done by" and "About" find anyone by typing, and the keyboard picks them', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/activity');

  // "Done by" opens on a search, with anyone first and the people under it, by name
  await page.getByRole('button', { name: 'Done by: Anyone' }).click();
  const search = page.getByRole('combobox', { name: 'Search name or email' });
  await expect(search).toBeFocused();
  const options = page.getByRole('listbox', { name: 'Done by' }).getByRole('option');
  await expect(options.first()).toHaveText('Anyone');
  await expectAccessible(page, 'the person filter', '.ui-ps-panel');

  // Typing narrows it to the names and emails that hold it; Enter picks the one the arrow keys are on
  await search.fill('olivia.ben');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Olivia Bennett');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Done by: Olivia Bennett' })).toBeFocused();
  await expect(page).toHaveURL(/\/activity$/);
  for (const text of await page.locator('.log tbody tr .cell-actor').allTextContents()) {
    expect(text).toContain('Olivia Bennett');
  }

  // Nobody by that name: it says so; Escape closes the list and leaves the filter as it was
  await page.getByRole('button', { name: 'Done by: Olivia Bennett' }).click();
  await search.fill('nobody-by-this-name');
  await expect(page.locator('.ui-ps-panel')).toContainText('No one found');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-ps-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Done by: Olivia Bennett' })).toBeFocused();

  // "About" follows the address, so Back and reload agree
  await page.getByRole('button', { name: 'Clear Done by' }).click();
  await page.getByRole('button', { name: 'About: Anyone' }).click();
  await search.fill('isabella');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/activity\?user=u-/);
  await expect(page.getByRole('button', { name: 'About: Isabella Brooks' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'About: Isabella Brooks' })).toBeVisible();
});
