import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** A sales page from the menu; the group opens first when another group's page is showing */
async function salesLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Sales & Customer Service' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openSales(page: Page, path = 'overview') {
  await start(page, `/backoffice/sales/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/sales/${path}`);
}

test('sales: every page opens from the menu and passes the accessibility check; the overview leads to its sources', async ({ page }) => {
  await openSales(page);
  for (const [link, heading] of [['Revenue overview', 'Customer revenue overview'], ['LINE CRM', 'LINE CRM'], ['Insurance Claims', 'Insurance claims']]) {
    await salesLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/sales · ${link}`);
  }
  await salesLink(page, 'Revenue overview');
  await expect(page.locator('.bo-table').first().locator('tbody tr')).toHaveCount(6);
  await page.locator('.bo-table').nth(1).locator('tbody tr', { hasText: 'MSG-2609-120' }).click();
  await expect(page).toHaveURL('/backoffice/sales/line');
});

test('LINE CRM: a message goes only with the consent its purpose needs, and the rest go together', async ({ page }) => {
  await openSales(page, 'line');
  const outbox = page.locator('.bo-table.outbox tbody tr');
  await expect(outbox).toHaveCount(9);
  await expect(outbox.filter({ hasText: 'Arisa K.' })).toContainText('Withdrew consent to reminders');
  await expect(outbox.filter({ hasText: 'Kittikun S.' })).toContainText('Not linked on LINE');
  await expect(outbox.filter({ hasText: 'Arisa K.' }).getByRole('button')).toHaveCount(0);

  // The failed bill link goes again, as a new message
  await outbox.filter({ hasText: 'INV-2609-0031' }).getByRole('button', { name: 'Resend' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('The last attempt failed');
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('ui-toaster')).toContainText('MSG-2609-122 sent to Sirinya M.');
  await expect(outbox).toHaveCount(8);

  await page.getByRole('button', { name: 'Send all that may go (6)' }).click();
  await dialog.getByRole('button', { name: 'Send all' }).click();
  await expect(page.locator('ui-toaster')).toContainText('6 LINE messages sent');
  await expect(outbox).toHaveCount(2);
  await expect(page.locator('.kpi-strip')).toContainText('Sent today · ');
});

test('an insurance claim: written on a bill with its estimate, partly approved, and the insurer\'s money settles the bill', async ({ page }) => {
  await openSales(page, 'claims');
  await page.getByRole('button', { name: 'New claim' }).click();
  const drawer = page.locator('.drawer');
  await drawer.getByLabel('Policy').selectOption({ label: 'Falcon · FC-88120 · Patcharee L. · Bolt' });
  await drawer.getByLabel('Invoice').selectOption({ label: 'INV-2607-0045 · Vaccination · ฿1,150' });
  await expect(drawer).toContainText('Estimated payable');
  await expect(drawer.getByLabel('Amount (baht)')).toHaveValue('520');
  await drawer.getByLabel('Diagnosis').fill('Vaccine reaction, swelling at the site');
  await drawer.getByRole('button', { name: 'Create draft' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('ui-toaster')).toContainText('CLM-2609-009 created');

  // The claim that waits on Bolt's September bill: the insurer approves part, pays the hospital, and the bill is settled
  await page.locator('.bo-table tbody tr', { hasText: 'CLM-2609-007' }).click();
  await drawer.getByRole('button', { name: 'Record decision' }).click();
  await dialog.getByLabel('Decision').selectOption('partially-approved');
  await dialog.getByLabel('Approved amount (baht) — partial approvals only').fill('1450');
  await dialog.getByLabel('Reason or details (≥10 characters)').fill('supplement not covered by the plan');
  await dialog.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('ui-toaster')).toContainText('CLM-2609-007 → Partially approved');
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog.getByLabel('Paid to')).toHaveValue('hospital');
  await dialog.getByLabel('Transfer / EOB reference').fill('FAL-PAY-8811');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(drawer).toContainText('Matches the approval');
  await expect(drawer.locator('.timeline .tl')).toHaveCount(5);

  // The money is a payment on the invoice
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await menu.getByRole('button', { name: 'Finance & Revenue' }).click();
  await menu.getByRole('link', { name: 'Invoices', exact: true }).click();
  await expect(page.locator('.bo-table tbody tr', { hasText: 'INV-2609-0112' })).toContainText('Paid');
});
