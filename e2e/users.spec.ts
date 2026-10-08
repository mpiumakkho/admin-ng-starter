import { expect, test } from '@playwright/test';

import { signInAs, start } from './helpers';

const CSV = [
  'First name,Last name,Email,Phone,Department,Role',
  'Ann,Smith,ann.smith@example.com,0812345678,Design,Viewer',
  '"Lee, Jr",Bo,bo.lee@example.com,,Sales,Support',
  'No,Email,,,,',
  'Henry,Clone,henry.klein@example.com,,,',
  'Cy,Admin,cy@example.com,,,Administrator',
].join('\r\n');

test('imports the rows of a CSV file that pass the checks', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Manager');
  await page.goto('/users');

  await page.getByRole('button', { name: 'Import' }).click();
  await page.locator('app-import-users-dialog input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('.summary')).toContainText('2 ready to import');
  await expect(dialog.locator('.summary')).toContainText('3 with problems');
  await expect(dialog.locator('tbody tr').nth(2)).toContainText('The email is not valid.');
  await expect(dialog.locator('tbody tr').nth(3)).toContainText('Another user already has this email.');
  await expect(dialog.locator('tbody tr').nth(4)).toContainText('Your role cannot give this role.');

  await dialog.getByRole('button', { name: 'Import 2 users' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Imported 2 users');
  await page.locator('.toolbar-search input').fill('ann.smith');
  await expect(page.locator('.users-table tbody tr')).toHaveCount(1);
});

test('settings decide the default role and the allowed email domains', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings');

  await page.locator('#defaultRoleId').selectOption({ label: 'Support' });
  await page.locator('#allowedDomains').fill('corp.example');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Settings saved.');

  await page.goto('/users/new');
  await expect(page.locator('#roleId')).toHaveValue('support');
  await expect(page.locator('.role-summary')).toContainText('Helps users with their accounts');
  await page.locator('#email').fill('someone@gmail.com');
  await page.locator('#firstName').click();
  await expect(page.locator('.ui-field-error')).toContainText('Use an email at corp.example.');

  await page.goto('/activity');
  await expect(page.locator('tbody tr').first()).toContainText('Changed settings');
});
