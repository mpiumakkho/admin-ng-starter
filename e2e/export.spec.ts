import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { signInAs, start } from './helpers';

test('export: copy, Excel, CSV and print the users the list shows', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Printing opens no dialog in a test: the printed page's text is kept instead
  await page.addInitScript(() => {
    if (window !== window.parent) {
      window.print = () => {
        (window.parent as unknown as { printed: string }).printed = document.body.innerText;
      };
    }
  });
  await start(page);
  await signInAs(page, 'Administrator');
  await page.goto('/users');
  await page.locator('ui-filter-chips button', { hasText: 'Suspended' }).click();
  const shown = await page.locator('.users-table tbody tr').count();
  const exportAs = async (format: string) => {
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: format }).click();
  };

  await exportAs('Copy');
  await expect(page.locator('ui-toaster')).toContainText(`Copied ${shown} rows to the clipboard`);
  // Windows keeps line breaks on the clipboard as \r\n
  const lines = (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/);
  expect(lines.slice(0, 3)).toEqual(['Users', '', 'First name\tLast name\tEmail\tPhone\tDepartment\tRole\tStatus\tJoined\tLast active']);
  expect(lines.length).toBe(3 + shown);
  expect(lines.slice(3).every(line => line.split('\t')[6] === 'Suspended')).toBe(true);

  let download = page.waitForEvent('download');
  await exportAs('Excel');
  const workbook = await download;
  expect(workbook.suggestedFilename()).toBe('users.xlsx');
  // A ZIP, as every .xlsx file is
  expect((await readFile((await workbook.path())!)).subarray(0, 2).toString()).toBe('PK');

  download = page.waitForEvent('download');
  await exportAs('CSV');
  const csv = await download;
  expect(csv.suggestedFilename()).toBe('users.csv');
  const csvLines = (await readFile((await csv.path())!, 'utf8')).replace(/^﻿/, '').split('\n');
  expect(csvLines[0]).toBe('First name,Last name,Email,Phone,Department,Role,Status,Joined,Last active');
  expect(csvLines.length).toBe(1 + shown);

  await exportAs('Print');
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: string }).printed ?? '')).toContain('Users');
  const printed = await page.evaluate(() => (window as unknown as { printed: string }).printed);
  expect(printed).toContain(`${shown} rows, printed`);
  expect(printed).toContain('Suspended');
});
