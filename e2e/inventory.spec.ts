import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

/** An inventory page from the menu; the group opens first when another group's page is showing */
async function inventoryLink(page: Page, name: string) {
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const group = menu.getByRole('button', { name: 'Inventory' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await menu.getByRole('link', { name, exact: true }).click();
}

async function openInventory(page: Page, path = 'overview') {
  await start(page, `/backoffice/inventory/${path}`);
  await signInAs(page, 'Administrator');
  await expect(page).toHaveURL(`/backoffice/inventory/${path}`);
}

test('inventory: every page opens from the menu and passes the accessibility check', async ({ page }) => {
  test.slow();
  await openInventory(page);
  for (const [link, heading] of [['Inventory overview', 'Inventory overview'], ['Medication inventory', 'Medication inventory'], ['Lots & expiry', 'Lots & expiry'], ['Stock receipt', 'Stock receipt'],
    ['Dispense history', 'Dispense history'], ['Reorder worklist', 'Reorder worklist'], ['Controlled drugs', 'Controlled drug ledger'], ['Drug Recall', 'Drug recall']]) {
    await inventoryLink(page, link);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, `/backoffice/inventory · ${link}`);
  }
  // The overview's figures lead to their source pages; the reorder worklist is read-only
  await inventoryLink(page, 'Inventory overview');
  await page.locator('a.kpi', { hasText: 'Below reorder point' }).click();
  await expect(page).toHaveURL('/backoffice/inventory/reorder');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(4);
  await expect(page.locator('.notice')).toContainText('outside the approved scope');
  await expect(page.getByRole('button', { name: /order|acknowledge/i })).toHaveCount(0);

  // Dispense history answers only within a scope
  await inventoryLink(page, 'Dispense history');
  await expect(page.locator('.prompt')).toContainText('Select a patient or drug');
  await page.getByLabel('Patient', { exact: true }).selectOption('Mali · Kanokwan R.');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(5);
  await page.locator('.bo-table tbody tr').first().click();
  await expect(page.locator('.drawer')).toContainText('Nurse Kamol');
});

test('a receipt: the lot goes onto the shelf, the item leaves the reorder worklist, and the movement is kept', async ({ page }) => {
  await openInventory(page, 'receipts');
  await expect(page.getByRole('button', { name: 'Submit receipt' })).toBeDisabled();
  await page.getByLabel('Medication item').selectOption({ label: 'D02 · Amoxicillin 250 mg' });
  await expect(page.locator('.impact')).toContainText('18 tablets');
  await page.getByLabel('Lot', { exact: true }).fill('AM-2509-01');
  await page.getByLabel('Expiry date').fill('2028-09');
  await page.getByLabel('Received quantity (tablets)').fill('100');
  await page.getByLabel('Source reference (optional)').fill('DN-77100 · Zuellig');
  await expect(page.locator('.impact')).toContainText('118 tablets');
  await expect(page.locator('.ok-text')).toBeVisible();
  await page.getByRole('button', { name: 'Submit receipt' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('AM-2509-01');
  await dialog.getByRole('button', { name: 'Submit receipt' }).click();
  await expect(page.locator('ui-toaster')).toContainText('RC-2609-017 received');

  // The item's page shows the new stock and the receipt as its latest movement
  await expect(page).toHaveURL(/\/backoffice\/inventory\/items\/Amoxicillin/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Amoxicillin 250 mg');
  await expect(page.locator('.data-grid.wide')).toContainText('118 tablets');
  await expect(page.locator('.bo-table').nth(1).locator('tbody tr').first()).toContainText('+100');
  await inventoryLink(page, 'Reorder worklist');
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(3);
  await inventoryLink(page, 'Medication inventory');
  await page.getByLabel('Search medication').fill('amoxicillin 250');
  await expect(page.locator('.bo-table tbody tr', { hasText: 'D02' })).toContainText('In stock');
});

test('the controlled-drug ledger: a dispense needs its witness, a count that differs opens an investigation that someone else resolves, and a recalled lot is quarantined', async ({ page }) => {
  test.slow();
  await openInventory(page, 'controlled');
  const card = page.locator('.action-card');
  await card.getByLabel('Medication item').selectOption({ label: 'Buprenorphine 0.3 mg/mL (inj) · 6 mL' });
  await card.getByLabel('Patient').selectOption('Nala · Waraporn D.');
  await card.getByLabel('Quantity drawn (mL)').fill('0.5');
  await expect(card).toContainText('This drug needs a witness');
  await expect(card.getByRole('button', { name: 'Record dispense' })).toBeDisabled();
  await card.getByLabel('Witness (required for this drug)').selectOption({ label: 'Nurse Kamol' });
  await card.getByRole('button', { name: 'Record dispense' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Nurse Kamol');
  await dialog.getByRole('button', { name: 'Confirm dispense' }).click();
  await expect(page.locator('ui-toaster')).toContainText('LD-2609-032 dispensed');
  await expect(page.locator('.bo-table tbody tr').first()).toContainText('LD-2609-032');
  await expect(page.locator('button.kpi', { hasText: 'Buprenorphine' })).toContainText('5.5');

  // Only the counted figure is given; the system finds the difference and opens the investigation, which the counter cannot close
  await card.getByRole('button', { name: 'Count' }).click();
  await card.getByLabel('Actual quantity (mL)').fill('5');
  await card.getByRole('button', { name: 'Record count' }).click();
  await dialog.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('ui-toaster')).toContainText('investigation CT-2609-022 opened');
  const row = page.locator('.bo-table tbody tr', { hasText: 'CT-2609-022' });
  await expect(row).toContainText('Under investigation');
  await expect(row.getByRole('button', { name: 'Resolve' })).toBeDisabled();

  // The manager signs in (through the app, not the address bar: the sample lives in memory) and resolves it one way
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await signInAs(page, 'Manager');
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'BackOffice' }).click();
  await inventoryLink(page, 'Controlled drugs');
  await page.locator('.record-main').getByRole('button', { name: 'Count' }).click();
  await row.getByRole('button', { name: 'Resolve' }).click();
  await dialog.getByLabel('Resolution notes (≥10 characters)').fill('found the waste of the 0.5 mL draw not yet entered');
  await dialog.getByRole('button', { name: 'Resolve' }).click();
  await expect(row).toContainText('Resolved');
  await expect(row.getByRole('button')).toHaveCount(0);

  // The open recall: the lot is held back on the shelf and the recall moves forward
  await inventoryLink(page, 'Drug Recall');
  await page.locator('button.kpi', { hasText: 'RCL-2609-002' }).click();
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.bo-table tbody tr').first()).toContainText('40 tablets');
  await page.getByRole('button', { name: 'Quarantine on-hand' }).click();
  await dialog.getByRole('button', { name: 'Quarantine on-hand' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Lot B-2312-04 quarantined');
  await page.getByRole('button', { name: 'Update recall' }).click();
  await dialog.getByLabel('New status').selectOption('contained');
  await dialog.getByLabel('What was done (≥10 characters)').fill('shelf stock quarantined, no patient received this lot');
  await dialog.getByRole('button', { name: 'Save update' }).click();
  await expect(page.locator('ui-toaster')).toContainText('RCL-2609-002 → Contained');
  await expect(page.locator('.timeline .tl')).toHaveCount(2);
});
