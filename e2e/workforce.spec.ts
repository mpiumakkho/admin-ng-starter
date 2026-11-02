import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** A workforce page from the menu; the group opens first when another group's page is showing */
async function workforceLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Workforce & Scheduling' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openWorkforce(page: Page, path = 'staff') {
  await start(page, `/backoffice/workforce/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/workforce/${path}`);
}

const PAGES: [string, string][] = [
  ['Staff directory', 'Staff directory'],
  ['Licences and credentials', 'Licences & credentials'],
  ['Continuing Education', 'Continuing education & training'],
  ['Privileges', 'Scope & clinical privileges'],
  ['Roster', 'Staff schedule'],
  ['Leave', 'Leave & time off'],
  ['On-call Rotation', 'On-call rotation'],
  ['Overtime Summary', 'Overtime summary'],
];

test('workforce: every page opens from the menu and passes the accessibility check; a person opens on their own page', async ({ page }) => {
  await openWorkforce(page);
  for (const [link, heading] of PAGES) {
    await workforceLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/workforce · ${link}`);
  }
  await workforceLink(page, 'Staff directory');
  await page.locator('.bo-table tbody tr', { hasText: 'Dr. Lalita' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Open details' }).click();
  await expect(page).toHaveURL('/backoffice/workforce/staff/S02');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dr. Lalita');
  await expect(page.locator('.bo-table').first()).toContainText('Expires within 30 days');
  await expectAccessible(page, '/backoffice/workforce/staff/S02');
});

test('a draft week goes out only once its conflicts are resolved: the locum\'s licence checked, the overlap handed over', async ({ page }) => {
  await openWorkforce(page, 'schedule');
  await page.getByRole('button', { name: '28/09 – 04/10' }).click();
  const kpis = page.locator('.kpi-strip');
  await expect(kpis.locator('.kpi').nth(1)).toContainText('5');
  await page.getByRole('button', { name: 'Publish the schedule' }).click();
  await expect(page.locator('ui-toaster')).toContainText('5 conflicts to resolve first');

  // The licence, checked by someone other than its holder
  await workforceLink(page, 'Licences and credentials');
  // More licences than one page holds: fifty rows a page
  await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('50');
  await page.locator('.bo-table tbody tr', { hasText: 'LIC-VET-0101' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Verified' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Confirm verification' }).click();
  await expect(page.locator('ui-toaster')).toContainText('LIC-VET-0101 verified');

  // The surgeon's afternoon goes to the locum, and the week is published
  await workforceLink(page, 'Roster');
  await page.getByRole('button', { name: '28/09 – 04/10' }).click();
  await page.getByRole('button', { name: 'Dr. Pichaya 2026-09-30 Afternoon shift · Cancel shift' }).click();
  await dialog.getByRole('button', { name: 'Cancel shift' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Dr. Pichaya\'s Afternoon shift on 2026-09-30 cancelled');
  await expect(page.locator('.record-rail')).toContainText('Wed 2026-09-30 · Afternoon');
  await page.getByRole('button', { name: 'Assign a shift · Dr. Phum 2026-09-30' }).click();
  await expect(page.locator('.action-card')).toContainText('No clash with other shifts, leave or licences');
  await page.getByRole('button', { name: 'Assign (draft)' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Afternoon shift on 2026-09-30 assigned to Dr. Phum');
  await expect(kpis.locator('.kpi').nth(1)).toContainText('0');
  await page.getByRole('button', { name: 'Publish the schedule' }).click();
  await dialog.getByRole('button', { name: 'Publish the schedule' }).click();
  await expect(page.locator('ui-toaster')).toContainText('55 shifts published');
});

test('leave approved by someone else becomes conflicts on the schedule; the on-call nights are generated fairly and published', async ({ page }) => {
  await openWorkforce(page, 'leave');
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('LV-2609-08');
  await expect(rail).toContainText('If approved, 3 shifts need cover in the schedule');
  await rail.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('3 shifts will fall below the minimum');
  await dialog.getByLabel('Reason (≥10 characters)').fill('Approved, cover will be arranged this week');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('ui-toaster')).toContainText('LV-2609-08 → Approved');

  await workforceLink(page, 'Roster');
  await page.getByRole('button', { name: '28/09 – 04/10' }).click();
  await expect(page.locator('.kpi-strip .kpi').nth(1)).toContainText('8');
  await expect(page.locator('.kpi-strip .kpi').nth(3)).toContainText('3');

  await workforceLink(page, 'On-call Rotation');
  await page.getByRole('button', { name: '28/09 – 11/10' }).click();
  await expect(page.locator('.oncall-cal')).toContainText('Not assigned');
  await page.locator('.page-actions').getByRole('button', { name: 'Generate' }).click();
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('ui-toaster')).toContainText('14 nights assigned · draft');
  await expect(page.locator('.record-rail')).toContainText('Fair · within 1 night of each other');
  await page.locator('.page-actions').getByRole('button', { name: 'Publish' }).click();
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(page.locator('ui-toaster')).toContainText('14 on-call nights published');
});

test('a privilege is granted with a reason when its licence holds, and a CE course counts once reviewed', async ({ page }) => {
  await openWorkforce(page, 'privileges');
  await page.getByRole('button', { name: 'Nurse Kamol · Radiography: Not granted' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Reason (≥10 characters)').fill('Passed the 2026 radiation safety training');
  await dialog.getByRole('button', { name: 'Grant' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Radiography granted to Nurse Kamol');
  await expect(page.getByRole('button', { name: 'Nurse Kamol · Radiography: Granted' })).toBeVisible();
  // Dr. Pichaya has no controlled-drug licence: the grant is refused before any dialog
  await page.getByRole('button', { name: 'Dr. Pichaya · Prescribe controlled drugs: Not granted' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Needs a verified, unexpired Controlled-drug prescribing licence');

  await workforceLink(page, 'Continuing Education');
  await page.locator('.bo-table tbody tr', { hasText: 'Abdominal ultrasound course' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Count the hours' }).click();
  await dialog.getByLabel('Reason (≥10 characters)').fill('Certificate and hours checked with the provider');
  await dialog.getByRole('button', { name: 'Count the hours' }).click();
  await expect(page.locator('ui-toaster')).toContainText('CE-26-015 → Counted');
  await expect(page.locator('.ce-progress')).toContainText('Dr. Lalita24 / 20');
});
