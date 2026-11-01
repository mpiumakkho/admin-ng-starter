import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** An assets page from the menu; the group opens first when another group's page is showing */
async function assetsLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Assets & Maintenance' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openAssets(page: Page, path = 'registry') {
  await start(page, `/backoffice/assets/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/assets/${path}`);
}

const PAGES: [string, string][] = [
  ['Equipment registry', 'Equipment registry'],
  ['PM schedule', 'Preventive maintenance schedule'],
  ['Calibration', 'Equipment calibration'],
  ['Downtime', 'Equipment downtime'],
  ['Critical equipment', 'Critical equipment status'],
  ['Service Contracts', 'Equipment service contracts'],
  ['Decommission', 'Equipment decommissioning'],
];

test('assets: every page opens from the menu and passes the accessibility check; a device opens on its own page', async ({ page }) => {
  await openAssets(page);
  for (const [link, heading] of PAGES) {
    await assetsLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/assets · ${link}`);
  }
  await assetsLink(page, 'Equipment registry');
  await page.locator('.bo-table tbody tr', { hasText: 'EQ-OR1-ANES-01' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Open details' }).click();
  await expect(page).toHaveURL('/backoffice/assets/equipment/EQ-OR1-ANES-01');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Anaesthesia machine, OR 1');
  await expect(page.locator('.record-rail')).toContainText('PM 4 days overdue');
  await expectAccessible(page, '/backoffice/assets/equipment/EQ-OR1-ANES-01');
});

test('the anaesthesia machine goes back into service once tested, its late PM is recorded, and it shows ready', async ({ page }) => {
  await openAssets(page, 'downtime');
  await page.locator('.bo-table tbody tr', { hasText: 'DT-2609-005' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Back in service' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Fix').fill('Flow sensor replaced and leak test passed');
  await dialog.getByLabel('Repair cost (baht)').fill('9800');
  // Not until it was tested
  await expect(dialog.getByRole('button', { name: 'Back in service' })).toBeDisabled();
  await dialog.getByLabel('Tested before going back into service').check();
  await dialog.getByRole('button', { name: 'Back in service' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Anaesthesia machine, OR 1 is back in service · DT-2609-005');

  await assetsLink(page, 'PM schedule');
  await page.locator('.bo-table tbody tr', { hasText: 'PM-007' }).click();
  await page.locator('.record-rail').getByRole('button', { name: 'Record PM' }).click();
  await dialog.getByRole('button', { name: 'Record PM' }).click();
  await expect(page.locator('ui-toaster')).toContainText('PM-007 recorded · next due 2027-03-24');

  await assetsLink(page, 'Critical equipment');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'EQ-OR1-ANES-01' })).toContainText('Ready');
});

test('a monitor out of calibration is recorded with its certificate, and the lapsed defibrillator contract is renewed', async ({ page }) => {
  await openAssets(page, 'calibration');
  const overdue = page.locator('button.kpi', { hasText: 'Overdue' });
  await expect(overdue).toContainText('2');
  await page.locator('.bo-table tbody tr', { hasText: 'EQ-ICU-MON-03' }).first().click();
  await page.locator('.drawer').getByRole('button', { name: 'Record a new result' }).click();
  const drawer = page.locator('.drawer');
  await expect(drawer).toContainText('A pass needs its calibration certificate');
  await drawer.getByLabel('Certificate (file)').fill('CAL-MON03.pdf');
  await drawer.getByRole('button', { name: 'Record result' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Record result' }).click();
  await expect(page.locator('ui-toaster')).toContainText('CAL-26-009 recorded · next due 2027-09-24');
  await expect(overdue).toContainText('1');

  await assetsLink(page, 'Service Contracts');
  await page.locator('.bo-table tbody tr', { hasText: 'SC-003' }).click();
  await expect(page.locator('.drawer')).toContainText('these have no repair contract');
  await page.locator('.drawer').getByRole('button', { name: 'Renew contract' }).click();
  await dialog.getByLabel('New end date (YYYY-MM-DD)').fill('2027-08-31');
  await dialog.getByRole('button', { name: 'Renew contract' }).click();
  await expect(page.locator('ui-toaster')).toContainText('SC-003 renewed to 2027-08-31');

  await assetsLink(page, 'Critical equipment');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'EQ-ICU-DEF-01' })).toContainText('Ready');
});

test('an old ECG is decommissioned by someone other than the requester, with disposal evidence, and leaves its contract', async ({ page }) => {
  await openAssets(page, 'decommission');
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('DEC-2609-001');
  await expect(rail).toContainText('Comes off contract SC-006');
  await rail.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Reason (≥10 characters)').fill('Approved, the ePM 12M replaces it');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('ui-toaster')).toContainText('DEC-2609-001 → Approved');
  await rail.getByRole('button', { name: 'Confirm decommissioning' }).click();
  await dialog.getByLabel('Disposal evidence').fill('Scrap receipt RC-6609-031');
  await dialog.getByRole('button', { name: 'Confirm decommissioning' }).click();
  await expect(page.locator('ui-toaster')).toContainText('3-lead ECG (old model) decommissioned · DEC-2609-001');

  await assetsLink(page, 'Service Contracts');
  await page.locator('.bo-table tbody tr', { hasText: 'SC-006' }).click();
  await expect(page.locator('.drawer .bo-table')).not.toContainText('EQ-OPD-MON-00');
  await expect(page.locator('.drawer .timeline')).toContainText('Equipment taken off');
  await assetsLink(page, 'Equipment registry');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'EQ-OPD-MON-00' })).toHaveCount(0);
});
