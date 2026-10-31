import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** A finance page from the menu; the group opens first when another group's page is showing */
async function financeLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Finance & Revenue' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openFinance(page: Page, path = 'overview') {
  await start(page, `/backoffice/finance/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/finance/${path}`);
}

test('finance: every page opens from the menu and passes the accessibility check', async ({ page }) => {
  test.slow();
  await openFinance(page);
  for (const [link, heading] of [['Finance overview', 'Finance overview'], ['Invoices', 'Invoices'], ['Payments', 'Payments'], ['Discounts & refunds', 'Discounts & refunds'],
    ['Receivables', 'Receivables'], ['Daily reconciliation', 'Daily reconciliation'], ['Accounting export', 'Accounting export']]) {
    await financeLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/finance · ${link}`);
  }
  // The overview's figures lead to their source pages
  await financeLink(page, 'Finance overview');
  await page.locator('a.kpi', { hasText: 'Outstanding' }).click();
  await expect(page).toHaveURL('/backoffice/finance/receivables');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(2);
});

test('an invoice: written from the charge items, issued with its number, paid in two parts with references, and sent to accounting', async ({ page }) => {
  await openFinance(page, 'invoices');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(9);
  await page.getByRole('button', { name: 'Create invoice' }).click();
  const drawer = page.locator('.drawer');
  await drawer.getByLabel('Owner').selectOption('Somsak W.');
  await drawer.getByLabel('Pet').selectOption('Kiki');
  await drawer.getByLabel('Items', { exact: true }).fill('Retail · collar and food');
  await drawer.getByLabel('Add a line').selectOption({ label: 'Retail · Flea and tick collar · ฿650' });
  await drawer.getByLabel('Add a line').selectOption({ label: 'Retail · Renal diet dry food 2 kg · ฿890' });
  await drawer.locator('.mini-lines input.qty').first().fill('2');
  await drawer.locator('.mini-lines input.qty').first().dispatchEvent('change');
  await expect(drawer.locator('.mini-lines tfoot')).toContainText('฿2,343.3');
  await drawer.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(/\/backoffice\/finance\/invoices\/I10$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Draft');

  // Issued: a number, a due date, and a delivery queued
  await page.getByRole('button', { name: 'Issue invoice' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('INV-2609-0159');
  await expect(page.locator('.page-head')).toContainText('Due 2026-10-09');
  await expect(page.locator('.timeline')).toContainText('Queued');

  // A card payment needs its reference; two payments settle it
  await page.getByRole('button', { name: 'Collect payment' }).click();
  await dialog.getByLabel('Amount (baht)').fill('1000');
  await dialog.getByLabel('Payment method').selectOption('บัตรเครดิต');
  await dialog.getByRole('checkbox', { name: /Checked the invoice/ }).check();
  await dialog.getByRole('checkbox', { name: 'Print receipt' }).uncheck();
  await expect(dialog.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  await dialog.getByLabel('Reference').fill('KB-7781');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Partially paid');
  await expect(page.locator('.summary')).toContainText('฿1,343.3');
  await page.getByRole('button', { name: 'Collect the balance' }).click();
  await dialog.getByRole('checkbox', { name: /Checked the invoice/ }).check();
  await dialog.getByRole('checkbox', { name: 'Print receipt' }).uncheck();
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('.page-head .chip')).toHaveText('Paid');
  await expect(page.locator('.ledger tbody tr')).toHaveCount(2);

  // Both receipts are in the ledger and queued for accounting
  await financeLink(page, 'Payments');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'KB-7781' })).toContainText('INV-2609-0159');
  await financeLink(page, 'Accounting export');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'INV-2609-0159' })).toHaveCount(3);
});

test('refunds and discounts: a small refund is immediate, a large one waits for the approval that then takes effect; a failed delivery is resent', async ({ page }) => {
  await openFinance(page, 'invoices/I5');
  const dialog = page.locator('dialog[open]');
  // ฿300 is under the threshold: done at once, a credit note queued
  await page.getByRole('button', { name: 'Refund' }).click();
  await dialog.getByLabel('Refund amount (baht)').fill('300');
  await dialog.getByLabel('Reason (≥10 characters)').fill('one item was not given, owner agreed');
  await dialog.getByRole('button', { name: 'Refund' }).click();
  await expect(page.locator('ui-toaster')).toContainText('฿300 refunded');
  await expect(page.locator('.page-head .chip')).toHaveText('Partially paid');
  await expect(page.locator('.ledger tr.nested')).toContainText('Refunded');

  // ฿1,000 goes to the finance manager; approved there, the money moves
  await page.getByRole('button', { name: 'Refund' }).click();
  await dialog.getByLabel('Refund amount (baht)').fill('1000');
  await dialog.getByLabel('Reason (≥10 characters)').fill('renal panel repeated at no charge, owner asked for the money back');
  await dialog.getByRole('button', { name: 'Refund' }).click();
  await expect(page.locator('ui-toaster')).toContainText('sent to the finance manager');
  await expect(page.locator('.ledger tr.nested').last()).toContainText('Awaiting approval');
  // The requester cannot approve their own request: the manager signs in (through the app, not the address bar: the sample lives in memory)
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await signInAs(page, 'Manager');
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'BackOffice' }).click();
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Pending Approvals/ }).click();
  await page.locator('.bo-table tbody tr', { hasText: 'RF-2609-005' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Approve' }).click();
  await dialog.getByLabel('Reason (≥10 characters)').fill('checked with the vet, the panel was repeated');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await financeLink(page, 'Invoices');
  await page.locator('.bo-table tbody tr', { hasText: 'INV-2608-0007' }).click();
  await expect(page.locator('.summary')).toContainText('−฿1,300');
  await expect(page.locator('.ledger tr.nested').last()).toContainText('Refunded');

  // A discount above a tenth of the bill also waits; under it, it applies
  await financeLink(page, 'Invoices');
  await page.locator('.bo-table tbody tr', { hasText: 'INV-2609-0031' }).click();
  await page.getByRole('button', { name: 'Discount' }).click();
  await dialog.getByLabel('Discount amount (baht)').fill('50');
  await dialog.getByLabel('Reason (≥10 characters)').fill('loyalty discount per the campaign');
  await dialog.getByRole('button', { name: 'Apply discount' }).click();
  await expect(page.locator('ui-toaster')).toContainText('new total ฿930');
  await expect(page.locator('.summary')).toContainText('−฿50');
  await financeLink(page, 'Discounts & refunds');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'DC-2609-001' })).toContainText('Applied');

  // The failed deliveries of the 23rd go again, and the day reconciles with its result kept
  await financeLink(page, 'Accounting export');
  await page.locator('button.kpi', { hasText: 'Failed' }).click();
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(3);
  await page.locator('.bo-table tbody tr', { hasText: 'XP-0101' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Resend' }).click();
  await dialog.getByRole('button', { name: 'Resend' }).click();
  await expect(page.locator('ui-toaster')).toContainText('XP-0101 delivered');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(2);
  await financeLink(page, 'Daily reconciliation');
  await page.locator('.page-head input[type="date"]').fill('2026-09-23');
  await expect(page.locator('.kpi-strip')).toContainText('1/3');
  await page.getByRole('button', { name: 'Record result' }).click();
  await dialog.getByLabel('What was found and done').fill('PEAK token renewed; two deliveries still to resend');
  await dialog.getByRole('button', { name: 'Record result' }).click();
  await expect(page.locator('.notice')).toContainText('PEAK token renewed');
});
