import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** A governance page from the menu; the group opens first when another group's page is showing */
async function link(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Quality & Governance' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function open(page: Page, path: string) {
  await start(page, `/backoffice/quality/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/quality/${path}`);
}

const PAGES: [string, string][] = [
  ['DPO Dashboard', 'PDPA overview'],
  ['DSAR', 'Data subject requests'],
  ['Consent Registry', 'Consent registry'],
  ['Breach Management', 'Data breaches'],
  ['Retention', 'Data retention policies'],
  ['RoPA / Cross-border', 'RoPA & cross-border transfers'],
  ['Audit Explorer', 'Audit explorer'],
  ['Export Requests', 'Audit export requests'],
  ['Chain / Retention Status', 'Audit integrity & retention'],
];

test('governance: every PDPA and audit page opens from its submenu and passes the accessibility check, the detail pages too', async ({ page }) => {
  // Eleven pages through the accessibility check take longer than one test's default
  test.setTimeout(120_000);
  await open(page, 'pdpa');
  for (const [name, heading] of PAGES) {
    await link(page, name);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/quality · ${name}`);
  }
  await link(page, 'DSAR');
  await page.locator('.bo-table tbody tr', { hasText: 'DSAR-2609-004' }).click();
  await expect(page).toHaveURL('/backoffice/quality/dsar/DSAR-2609-004');
  await expect(page.locator('.record-main')).toContainText('Due soon');
  await expectAccessible(page, '/backoffice/quality/dsar/DSAR-2609-004');
  await link(page, 'Breach Management');
  await page.locator('.bo-table tbody tr', { hasText: 'BR-2609-002' }).click();
  await expect(page).toHaveURL('/backoffice/quality/breach/BR-2609-002');
  await expectAccessible(page, '/backoffice/quality/breach/BR-2609-002');
});

test('a request is delivered only once the requester is verified and the data gathered', async ({ page }) => {
  await open(page, 'dsar');
  await page.locator('.bo-table tbody tr', { hasText: 'DSAR-2609-005' }).click();
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('Verify identity before fulfilment');
  await expect(rail.getByRole('button', { name: 'Fulfil request' })).toBeDisabled();
  await rail.getByRole('button', { name: 'Verify identity' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Verify identity' }).click();
  await expect(page.locator('ui-toaster')).toContainText('DSAR-2609-005 identity verified');
  await page.locator('.bo-table tbody tr', { hasText: 'EMR' }).getByRole('button', { name: 'Collect' }).click();
  await dialog.getByRole('button', { name: 'Collect' }).click();
  await rail.getByRole('button', { name: 'Fulfil request' }).click();
  await dialog.getByRole('button', { name: 'Fulfil request' }).click();
  await expect(page.locator('ui-toaster')).toContainText('DSAR-2609-005 delivered');
  await expect(page.locator('.steps li.current')).toHaveText('Deliver');
});

test('an audit export needs someone else\'s approval; once made by the server it feeds the DSAR waiting on it', async ({ page }) => {
  await open(page, 'audit-exports');
  await page.locator('.bo-table tbody tr', { hasText: 'AX-2609-002' }).click();
  const rail = page.locator('.record-rail');
  await rail.getByRole('button', { name: 'Approve export' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Reason (≥10 characters)').fill('The scope matches DSAR-2609-004');
  await dialog.getByRole('button', { name: 'Approve export' }).click();
  await expect(page.locator('ui-toaster')).toContainText('AX-2609-002 → Approved');
  await rail.getByRole('button', { name: 'Export' }).click();
  await dialog.getByRole('button', { name: 'Export' }).click();
  await expect(page.locator('ui-toaster')).toContainText('AX-2609-002.csv ready · 8 rows');

  // Your own request waits for someone else
  await rail.getByRole('button', { name: 'New request' }).click();
  await rail.getByRole('textbox', { name: 'HN' }).fill('HN-130904');
  await rail.getByRole('combobox', { name: 'Purpose', exact: true }).selectOption({ label: 'Internal audit' });
  await rail.getByRole('textbox', { name: 'Purpose reference' }).fill('IA-2609-02');
  await rail.getByRole('button', { name: 'Submit' }).click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(rail).toContainText('The requester cannot approve their own export (segregation of duties)');
  await expect(rail.getByRole('button', { name: 'Approve export' })).toBeDisabled();

  await link(page, 'DSAR');
  await page.locator('.bo-table tbody tr', { hasText: 'DSAR-2609-004' }).click();
  await expect(page.locator('.bo-table tbody tr', { hasText: 'Access log' })).toContainText('Collected');
});

test('a breach closes only once its severity\'s notices are sent; a withdrawn consent stops at once', async ({ page }) => {
  await open(page, 'breach');
  await page.locator('.bo-table tbody tr', { hasText: 'BR-2609-002' }).click();
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('Notification required before closing');
  await expect(rail.getByRole('button', { name: 'Close breach' })).toBeDisabled();
  await rail.getByRole('button', { name: 'Notify' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('PDPC acknowledgement number').fill('PDPC-6909-0231');
  await dialog.getByRole('button', { name: 'Record notice' }).click();
  await rail.getByRole('button', { name: 'Close breach' }).click();
  await dialog.getByLabel('Outcome and remedy (≥10 characters)').fill('The recipient deleted the message and confirmed it');
  await dialog.getByRole('button', { name: 'Close breach' }).click();
  await expect(page.locator('ui-toaster')).toContainText('BR-2609-002 closed');

  await link(page, 'Consent Registry');
  await page.getByRole('searchbox', { name: 'Search owners' }).fill('Napat');
  const row = page.locator('.bo-table.consents-ledger tbody tr', { hasText: 'LINE reminders' });
  await row.getByRole('button', { name: 'Withdraw consent' }).click();
  await dialog.getByRole('button', { name: 'Withdraw consent' }).click();
  await expect(row).toContainText('Withdrawn');
});
