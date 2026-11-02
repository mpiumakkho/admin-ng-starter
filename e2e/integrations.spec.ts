import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

async function menuLink(page: Page, group: string, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const button = menu.getByRole('button', { name: group });
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await button.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

const PAGES: [string, string][] = [
  ['Integration overview', 'Integration overview'],
  ['Adapter Configuration', 'Accounting adapter configuration'],
  ['Delivery Queue', 'Accounting delivery queue'],
  ['Reconciliation', 'Accounting delivery reconciliation'],
  ['Lab & Imaging Connections', 'Lab & imaging connections'],
  ['Insurance Adapters (P4)', 'Insurance adapters'],
  ['Import/Export History', 'Import & export history'],
];

test('integration center: each page opens from the menu, passes the accessibility check, and offers no e-Tax action', async ({ page }) => {
  await start(page, '/backoffice/integrations/overview');
  await signInAs(page, 'Administrator');
  for (const [link, heading] of PAGES) {
    await menuLink(page, 'Integration Center', link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/integrations · ${link}`);
    await expect(page.getByRole('button', { name: /e-Tax|Replay|Rotate|Activate/ })).toHaveCount(0);
  }
});

test('a token renewed, tested and the failed deliveries retried: one record shows delivered in both views and the connector recovers', async ({ page }) => {
  await start(page, '/backoffice/integrations/overview');
  await signInAs(page, 'Administrator');
  const accounting = page.locator('.connectors tbody tr', { hasText: 'Accounting · PEAK' });
  await expect(accounting).toContainText('Authentication failed');

  await menuLink(page, 'Integration Center', 'Adapter Configuration');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Test connection' }).click();
  await expect(page.locator('.config-rail')).toContainText('This result verifies connectivity only');
  await expect(page.locator('.test-log li').first()).toContainText('Pass');

  await menuLink(page, 'Integration Center', 'Delivery Queue');
  await page.getByRole('combobox', { name: 'Error class' }).selectOption({ label: 'Authentication' });
  await expect(page.locator('.delivery-queue tbody tr')).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page.locator('.delivery-queue tbody tr').first().click();
    await page.locator('.drawer').getByRole('button', { name: 'Retry delivery' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Resend' }).click();
  }
  await expect(page.locator('.delivery-queue tbody tr')).toHaveCount(1);
  await expect(page.locator('.delivery-queue tbody tr')).toContainText('Nothing matches the filters');

  await menuLink(page, 'Finance & Revenue', 'Accounting export');
  await page.locator('.filter-bar input[type=search]').fill('XP-0096');
  await expect(page.locator('.bo-table tbody tr').first()).toContainText('Delivered');

  await menuLink(page, 'Integration Center', 'Reconciliation');
  await expect(page.locator('.kpi', { hasText: 'Failed' }).locator('.kpi-value')).toHaveText('0');
  await menuLink(page, 'Integration Center', 'Integration overview');
  await expect(accounting).toContainText('Healthy');
});
