import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** A quality page from the menu; the group opens first when another group's page is showing */
async function qualityLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Quality & Governance' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openQuality(page: Page, path = 'overview') {
  await start(page, `/backoffice/quality/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/quality/${path}`);
}

const PAGES: [string, string][] = [
  ['Quality Dashboard', 'Quality & safety overview'],
  ['Incident Reports', 'Incident reports'],
  ['Near Miss', 'Near misses'],
  ['RCA', 'Root cause analysis'],
  ['KPI Library', 'KPI library'],
  ['Safety Culture / M&M', 'Safety culture & M&M review'],
  ['All complaints', 'All complaints'],
  ['Investigation', 'Complaint investigation'],
  ['Resolution & Trends', 'Complaint resolution & trends'],
];

test('quality: every page opens from the menu under its submenu and passes the accessibility check', async ({ page }) => {
  await openQuality(page);
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(menu.locator('#nav-quality .nav-section')).toHaveText(['Quality & Patient Safety', 'Complaint Management', 'PDPA', 'Audit']);
  for (const [link, heading] of PAGES) {
    await qualityLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/quality · ${link}`);
  }
});

test('an anonymous incident keeps no name, in the report or in the audit log', async ({ page }) => {
  await openQuality(page, 'incidents');
  await page.getByRole('button', { name: 'Report incident' }).click();
  const rail = page.locator('.record-rail');
  await rail.getByLabel('Category').selectOption({ label: 'Fall' });
  await rail.getByLabel('Place').selectOption({ label: 'OPD' });
  await rail.getByLabel('What happened').fill('Dog slipped on the wet floor of the waiting room');
  await rail.getByLabel('Immediate action').fill('Checked by the vet, no injury found');
  await rail.getByLabel('Report anonymously').check();
  await rail.getByRole('button', { name: 'Send report' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Anonymous');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Report INC-2609-006 sent · triage within 72 h');
  await expect(rail).toContainText('Reported by');
  await expect(rail).toContainText('Anonymous');

  // Through the menu: the sample lives in memory, so a reload would start it over
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await menu.getByRole('link', { name: 'Recent Activity', exact: true }).click();
  const row = page.locator('.bo-table tbody tr', { hasText: 'INC-2609-006' });
  await expect(row).toContainText('Incident reported');
  await expect(row).toContainText('Anonymous');
  await expect(row).not.toContainText('Admin');
});

test('a major harm closes only once its RCA is approved by someone outside the team; an RCA short of five whys cannot go', async ({ page }) => {
  await openQuality(page, 'incidents');
  await page.locator('.bo-table tbody tr', { hasText: 'INC-2609-001' }).click();
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('Major harm or worse needs an approved RCA before it closes');
  await expect(rail.getByRole('button', { name: 'Close incident' })).toBeDisabled();

  await qualityLink(page, 'RCA');
  await page.locator('.bo-table tbody tr', { hasText: 'RCA-2609-001' }).click();
  await expect(page.locator('.record-rail').getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  await expect(page.locator('.record-rail')).toContainText('At least 5 whys are needed (now 3)');

  await page.locator('.bo-table tbody tr', { hasText: 'RCA-2609-002' }).click();
  await page.locator('.record-rail').getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Reason (≥10 characters)').fill('The actions cover the handover and charting gaps');
  await dialog.getByRole('button', { name: 'Approve RCA' }).click();
  await expect(page.locator('ui-toaster')).toContainText('RCA-2609-002 → Approved');

  await qualityLink(page, 'Incident Reports');
  await page.locator('.bo-table tbody tr', { hasText: 'INC-2609-001' }).click();
  await page.locator('.record-rail').getByRole('button', { name: 'Close incident' }).click();
  await dialog.getByLabel('Outcome and learning (≥10 characters)').fill('Glucose normal in 6 hours; charting at the cage started');
  await dialog.getByRole('button', { name: 'Close incident' }).click();
  await expect(page.locator('ui-toaster')).toContainText('INC-2609-001 closed');
});

test('the Director signs off a severe answer, and an answered complaint is closed and followed up', async ({ page }) => {
  await openQuality(page, 'complaints');
  await page.locator('.bo-table tbody tr', { hasText: 'CMP-2609-010' }).click();
  const rail = page.locator('.record-rail');
  await expect(rail).toContainText('The answer awaits the Director\'s sign-off');
  await rail.getByRole('button', { name: 'Sign off answer' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Reason (≥10 characters)').fill('Complete and clear, may go to the owner');
  await dialog.getByRole('button', { name: 'Sign off and send' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Answer to CMP-2609-010 sent');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'CMP-2609-010' })).toHaveCount(0);

  await qualityLink(page, 'Resolution & Trends');
  const row = page.locator('.bo-table tbody tr', { hasText: 'CMP-2609-008' });
  await row.getByRole('button', { name: 'Close complaint' }).click();
  await dialog.getByLabel('Outcome (≥10 characters)').fill('The owner accepted; quotes now go before every procedure');
  await dialog.getByRole('button', { name: 'Close complaint' }).click();
  await expect(page.locator('ui-toaster')).toContainText('CMP-2609-008 resolved');
  await row.getByRole('button', { name: 'Follow up satisfaction' }).click();
  await dialog.getByLabel('Score (1–5)').selectOption('4');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Satisfaction for CMP-2609-008 recorded');
  await expect(row).toHaveCount(0);
});
