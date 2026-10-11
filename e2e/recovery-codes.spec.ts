import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, signOut, start, totp } from './helpers';

/** Back on the sign-in page as the Support sample account, at the code step, with a recovery code instead */
async function signInWithRecoveryCode(page: Page, code: string) {
  await page.locator('.demo-account', { hasText: 'Support' }).click();
  await page.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await expect(page.locator('#loginCode')).toBeFocused();
  await page.locator('#loginCode').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
}

async function openSecurity(page: Page) {
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Security and devices' }).click();
}

test('recovery codes: shown once when two-step sign-in turns on, each signs in once, and new ones replace them', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Support');
  await openSecurity(page);
  await page.getByRole('button', { name: 'Turn on' }).click();
  const dialog = page.locator('dialog[open]');
  const secret = (await dialog.locator('.secret code').textContent())!.replace(/\s/g, '');
  await dialog.locator('input[autocomplete=one-time-code]').fill(totp(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();

  await expect(dialog.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = dialog.locator('.recovery-codes code');
  await expect(codes).toHaveCount(10);
  const saved = await codes.allTextContents();
  expect(saved.every(code => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(code))).toBe(true);
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.recovery-row')).toContainText('10 of 10 recovery codes left');

  // In place of a code from the app, once
  await signOut(page);
  await signInWithRecoveryCode(page, saved[0]);
  await expect(page).not.toHaveURL(/\/login/);
  await signOut(page);
  await signInWithRecoveryCode(page, saved[0]);
  await expect(page.locator('ui-alert', { hasText: 'That recovery code is not right, or it was used already.' })).toBeVisible();
  await page.locator('#loginCode').fill(saved[1].toUpperCase());
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // New ones replace them
  await openSecurity(page);
  await expect(page.locator('.recovery-row')).toContainText('8 of 10 recovery codes left');
  await page.getByRole('button', { name: 'New recovery codes' }).click();
  await dialog.getByRole('button', { name: 'Make new codes' }).click();
  await expect(codes).toHaveCount(10);
  expect((await codes.allTextContents()).some(code => saved.includes(code))).toBe(false);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.recovery-row')).toContainText('10 of 10 recovery codes left');
});
