import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

async function openBackoffice(page: Page) {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'BackOffice' }).click();
  await expect(page).toHaveURL('/backoffice/home/overview');
}

test('the back office opens from the account menu with the spec\'s menu, and every home page passes the accessibility check', async ({ page }) => {
  await openBackoffice(page);
  await expect(page.locator('app-navbar')).toHaveCount(0);
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  // Only the groups with a page (home to the integration center so far): the reserved groups never, the others once their pages land
  await expect(menu.getByRole('button')).toHaveCount(9);
  for (const [link, heading] of [['Work Overview', 'Work Overview'], ['Pending Approvals', 'Pending Approvals'], ['Alerts & Exceptions', 'Alerts & Exceptions'], ['Recent Activity', 'Recent Activity']]) {
    await menu.getByRole('link', { name: new RegExp(`^${link}`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice · ${link}`);
  }
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Back to administration' }).click();
  await expect(page.locator('app-navbar')).toHaveCount(1);
});

test('the work overview gathers the modules\' work, filters it, and opens the source record from the inspector', async ({ page }) => {
  await openBackoffice(page);
  // The clinic's unpaid bills and short stock are on it beside the modules' own work
  await expect(page.locator('.kpi-strip')).toContainText('M11');
  // Ten rows a page: the bill is found by its number
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.pager-range')).toHaveText('Showing 1–10 of 24');
  await page.locator('.filter-bar input[type=search]').fill('INV-2609-0112');
  await page.locator('.bo-table tbody tr', { hasText: 'INV-2609-0112' }).click();
  const drawer = page.locator('.drawer');
  await expect(drawer).toContainText('Receivable');
  await expect(drawer).toContainText('This module\'s page is not open in BackOffice yet');
  // A module's figure filters the table to it
  await page.locator('.filter-bar input[type=search]').fill('');
  await page.locator('button.kpi', { hasText: 'M06' }).click();
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(2);
  await page.locator('.bo-table tbody tr', { hasText: 'B-2312-04' }).click();
  await drawer.getByRole('link', { name: 'Open the source record' }).click();
  await expect(page).toHaveURL(/\/clinic\/dispense$/);
});

test('approvals: a request is decided with a reason, never by its requester, and the decision goes into the activity log', async ({ page }) => {
  await openBackoffice(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Pending Approvals/ }).click();
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(5);
  await page.locator('.bo-table tbody tr', { hasText: 'RF-2609-003' }).click();
  const drawer = page.locator('.drawer');
  await drawer.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.locator('dialog[open]');
  const approve = dialog.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeDisabled();
  await dialog.getByLabel('Reason (≥10 characters)').fill('checked the payment and the cancelled item, refund due');
  await approve.click();
  await expect(page.locator('ui-toaster')).toContainText('RF-2609-003 approved');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(4);
  await page.locator('.segmented').getByRole('button', { name: 'Approved' }).click();
  await expect(page.locator('.bo-table tbody tr', { hasText: 'RF-2609-003' })).toContainText('Approved');
  // The inspector keeps the record it had, now with the decision on it
  await expect(drawer.locator('.decision')).toContainText('checked the payment');

  // A rejection needs its reason too
  await page.locator('.segmented').getByRole('button', { name: 'Awaiting approval' }).click();
  await page.locator('.bo-table tbody tr', { hasText: 'OV-2609-001' }).click();
  await drawer.getByRole('button', { name: 'Reject' }).click();
  await dialog.getByLabel('Reason (≥10 characters)').fill('scope too wide for the quarter close');
  await dialog.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('ui-toaster')).toContainText('OV-2609-001 rejected');

  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Recent Activity/ }).click();
  await expect(page.locator('.bo-table tbody tr').first()).toContainText('Request rejected');
  await page.locator('.bo-table tbody tr').first().click();
  await expect(drawer).toContainText('Before');
});

test('alerts: an exception is acknowledged with a note and moves to the acknowledged list; the source workflow opens', async ({ page }) => {
  await openBackoffice(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Alerts/ }).click();
  await expect(page.locator('.kpi-strip')).toContainText('2Critical');
  const row = page.locator('.bo-table tbody tr', { hasText: 'PAY-2609-0391' });
  await row.getByRole('button', { name: 'Acknowledge' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('What was done or passed on').fill('called the bank, answer within an hour');
  await dialog.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.locator('ui-toaster')).toContainText('PAY-2609-0391 acknowledged');
  await expect(page.locator('.kpi-strip')).toContainText('1Critical');
  await page.locator('details summary').click();
  await expect(page.locator('details')).toContainText('called the bank');

  // Only the gravest, then the owning workflow of a stock exception
  await page.locator('button.kpi', { hasText: 'Critical' }).click();
  await expect(page.locator('section.group')).toHaveCount(1);
  await page.locator('button.kpi', { hasText: 'Critical' }).click();
  await page.locator('.bo-table tbody tr', { hasText: 'BU-2411-02' }).getByRole('link', { name: 'Open workflow' }).click();
  await expect(page).toHaveURL(/\/clinic\/ward$/);
});

test('the menu narrows to its icons from the panel button in the navbar, as in the admin: a group shows its pages beside it, and the fold is remembered', async ({ page }) => {
  await openBackoffice(page);
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  // One group open at a time, as the admin's menu
  await menu.getByRole('button', { name: 'Finance & Revenue' }).click();
  await expect(menu.getByRole('button', { name: 'Finance & Revenue' })).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Collapse menu' }).click();
  await expect(page.locator('.body.collapsed')).toHaveCount(1);
  await menu.getByRole('button', { name: 'Inventory' }).hover();
  await menu.getByRole('link', { name: 'Medication inventory', exact: true }).click();
  await expect(page).toHaveURL('/backoffice/inventory/stock');
  await expectAccessible(page, 'the folded menu');

  // By keyboard: the icon's pages open on focus and Escape hands focus back
  await menu.getByRole('button', { name: 'Workforce & Scheduling' }).focus();
  await expect(menu.getByRole('button', { name: 'Workforce & Scheduling' })).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(menu.getByRole('button', { name: 'Workforce & Scheduling' })).toBeFocused();
  await expect(menu.getByRole('button', { name: 'Workforce & Scheduling' })).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(page.locator('.body.collapsed')).toHaveCount(1);
  await page.getByRole('button', { name: 'Expand menu' }).click();
  await expect(page.locator('.body.collapsed')).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Inventory' })).toHaveAttribute('aria-expanded', 'true');
});
