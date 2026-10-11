import { expect, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

test('a risky change asks for the password again once the sign-in is old, then goes through as it was', async ({ page }) => {
  await page.clock.install();
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');
  const shortest = page.getByLabel('Shortest password');
  const again = page.getByLabel('Ask for the password again after');
  await expect(again.locator('option:checked')).toHaveText('10 minutes');

  // Back at the desk after a break: the sign-in no longer counts for changing the settings
  await page.clock.fastForward('11:00');
  await shortest.selectOption({ label: '12 characters' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm it\'s you' });
  await expect(dialog).toContainText('more than 10 minutes ago');
  await expect(dialog.getByLabel('Password')).toBeFocused();
  await expectAccessible(page);

  // Closed: nothing is saved, and the page keeps what was chosen
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('ui-toaster')).toContainText('This change needs your password first.');
  await expect(shortest.locator('option:checked')).toHaveText('12 characters');

  // Confirmed: the same change goes again by itself
  await page.getByRole('button', { name: 'Save changes' }).click();
  await dialog.getByLabel('Password').fill('nope');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog.getByRole('alert')).toContainText('That password is not right.');
  await dialog.getByLabel('Password').fill('any-password');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');

  // Never: the settings stop asking, even after a long break
  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await again.selectOption({ label: 'Never' });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(save).not.toHaveClass(/ui-btn-loading/);
  await page.clock.fastForward('02:00:00');
  // The notice of the last save has gone by now, so the next one is this save's
  await expect(page.locator('ui-toaster')).not.toContainText('Settings saved.');
  await shortest.selectOption({ label: '14 characters' });
  await save.click();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');
  await expect(dialog).toBeHidden();
});
