import { expect, test } from '@playwright/test';

import { signInAs, start } from './helpers';

test('emails come in the language someone last used the app in', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Viewer');
  const language = page.locator('ui-detail-item', { hasText: 'Email language' });
  // The app tells the server the language it is in once signed in
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'My Profile' }).click();
  await expect(language).toContainText('English');

  // Switching changes it too
  await page.locator('.language-switch').getByText('TH', { exact: true }).click();
  await expect(page.locator('ui-detail-item', { hasText: 'ภาษาของอีเมล' })).toContainText('ไทย');
});

test('an administrator picks the language of a new person’s invitation, and the one for everyone not known yet', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users/new');
  const picker = page.locator('#language');
  await expect(picker.locator('option').first()).toHaveText('Same as the settings (ไทย)');
  await picker.selectOption('en');

  await page.goto('/settings');
  await page.locator('#defaultLanguage').selectOption('en');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});
