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

const REPORTS: [string, string][] = [
  ['Executive Overview', 'Executive overview'],
  ['Revenue & Collection', 'Revenue & collection'],
  ['Inventory Risk', 'Inventory risk'],
  ['Workforce Readiness', 'Workforce readiness'],
  ['Asset Readiness', 'Asset readiness'],
  ['Quality & Safety', 'Quality & safety'],
  ['Audit & Compliance', 'Audit & compliance'],
];

test('reports: each opens from the menu with its metric contracts and passes the accessibility check', async ({ page }) => {
  await start(page, '/backoffice/reports/executive');
  await signInAs(page, 'Administrator');
  for (const [link, heading] of REPORTS) {
    await menuLink(page, 'Executive Reporting', link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('.metric-contracts summary')).toContainText('Metric contracts (prototype)');
    await expectAccessible(page, `/backoffice/reports · ${link}`);
  }
  await expect(page.locator('body')).not.toContainText(/P&L|Gross Margin|EBITDA|Budget Variance/);
});

test('the executive overview ranks what needs deciding and leads back to the page that owns it', async ({ page }) => {
  await start(page, '/backoffice/reports/executive');
  await signInAs(page, 'Administrator');
  await expect(page.locator('.report-rows tbody tr').first()).toContainText('Critical');
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.report-rows').getByRole('link', { name: 'DT-2609-005' }).click();
  await expect(page).toHaveURL('/backoffice/assets/downtime');
});

test('a report reads the modules as they are: a new incident shows at once', async ({ page }) => {
  await start(page, '/backoffice/reports/quality');
  await signInAs(page, 'Administrator');
  const open = page.locator('.kpi', { hasText: 'Open incidents' }).locator('.kpi-value');
  await expect(open).toHaveText('5');
  await menuLink(page, 'Quality & Governance', 'Incident Reports');
  await page.getByRole('button', { name: 'Report incident' }).click();
  const rail = page.locator('.record-rail');
  await rail.getByLabel('Category').selectOption({ label: 'Fall' });
  await rail.getByLabel('Place').selectOption({ label: 'OPD' });
  await rail.getByLabel('What happened').fill('Dog slipped on the wet floor of the waiting room');
  await rail.getByLabel('Immediate action').fill('Checked by the vet, no injury found');
  await rail.getByRole('button', { name: 'Send report' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Send report' }).click();
  await menuLink(page, 'Executive Reporting', 'Quality & Safety');
  await expect(open).toHaveText('6');
});
