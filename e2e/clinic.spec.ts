import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

const TABS = [
  { link: 'Queue', heading: "Today's queue" },
  { link: 'Appointments', heading: 'Appointments' },
  { link: 'Encounter', heading: 'SOAP' },
  { link: 'Orders', heading: 'Orders' },
  { link: 'Results', heading: 'Results Inbox' },
  { link: 'Dispense', heading: 'Dispense' },
];

async function openClinic(page: Page) {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Clinical work' }).click();
  await expect(page).toHaveURL('/clinic/queue');
}

test('the clinical workspace opens from the account menu, fills the page, and every tab works', async ({ page }) => {
  await openClinic(page);
  // Its own shell bar and tabs instead of the admin navbar and sidebar
  await expect(page.locator('app-navbar')).toHaveCount(0);
  await expect(page.locator('app-sidebar')).toHaveCount(0);
  const tabs = page.getByRole('navigation', { name: 'Main menu' });
  for (const tab of TABS) {
    await tabs.getByRole('link', { name: new RegExp(`^${tab.link}`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: tab.heading })).toBeVisible();
    await expectAccessible(page, `/clinic · ${tab.link}`);
  }

  // Back to the admin pages from its own account menu
  await page.getByRole('button', { name: /^User menu/ }).click();
  await page.getByRole('menuitem', { name: 'Back to administration' }).click();
  await expect(page.locator('app-navbar')).toHaveCount(1);
});

test('the queue: a row opens the quick view, the context rail opens the patient, Escape closes', async ({ page }) => {
  await openClinic(page);
  await page.locator('.queue-table tbody tr', { hasText: 'Bolt' }).click();
  const sheet = page.locator('.sheet.open');
  await expect(sheet.getByRole('heading', { name: 'Quick view · Bolt' })).toBeVisible();
  await expect(sheet).toContainText('Allergy · Amoxicillin');
  await expectAccessible(page, 'quick view');

  // The stage filters the table
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.locator('.steps button', { hasText: 'Arrival' }).click();
  await expect(page.locator('.queue-table tbody tr')).toHaveCount(1);
  await page.locator('.steps button', { hasText: 'Arrival' }).click();
  await expect(page.locator('.queue-table tbody tr')).toHaveCount(8);

  await page.locator('.rail-btn').first().click();
  await expect(page.locator('.sheet.open .sheet-tabs button[aria-pressed="true"]')).toHaveText('Clinical alerts');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet.open')).toHaveCount(0);
});

test('the encounter: steps, a signature that locks S/O/A/P, and no drug the pet is allergic to', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Encounter/ }).click();
  await expect(page.locator('.patient-banner')).toContainText('Bolt');

  // Prescribing: Bolt is allergic to amoxicillin (penicillins), so it cannot be ordered
  await page.locator('.step-btn', { hasText: 'Medication' }).click();
  await page.getByRole('button', { name: 'New prescription' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('select').first().selectOption('Amoxicillin 250 mg');
  await expect(dialog.getByRole('alert')).toContainText('Runs into a clinical alert');
  await dialog.locator('select').first().selectOption('Tramadol 50 mg');
  await dialog.getByLabel('Dose').fill('1 tablet');
  await dialog.getByLabel('Dispense quantity').fill('10 tablets');
  await dialog.getByRole('button', { name: 'Prescribe' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Tramadol 50 mg prescribed for Bolt');
  await expect(page.locator('.form-panel')).toContainText('Tramadol 50 mg');

  // Signing locks S/O/A/P
  await page.locator('.step-btn', { hasText: 'SOAP' }).click();
  await page.getByRole('button', { name: 'Sign SOAP' }).click();
  await dialog.getByRole('button', { name: 'Sign' }).click();
  await expect(page.locator('.readonly-banner')).toContainText('SOAP signed');
  await expect(page.getByLabel('Chief complaint')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Close encounter' })).toBeEnabled();
});

test('results: a critical value is acknowledged only by phone with read-back', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Results/ }).click();
  await page.locator('.column', { hasText: 'Critical' }).locator('.task', { hasText: 'Nala' }).click();
  await page.locator('.sheet.open .sheet-foot').getByRole('button', { name: 'Acknowledge' }).click();

  const dialog = page.locator('dialog[open]');
  const confirm = dialog.getByRole('button', { name: 'Acknowledge' });
  await dialog.locator('select').selectOption('line');
  await expect(confirm).toBeDisabled();
  await dialog.locator('select').selectOption('phone');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await confirm.click();

  await expect(page.locator('.column', { hasText: 'Reviewed' })).toContainText('Nala');
  await expect(page.locator('.column', { hasText: 'Critical' }).locator('.task')).toHaveCount(0);
});

test('orders: a verbal order is co-signed, and a new order goes on the board', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Orders/ }).click();

  const cosign = page.locator('.cosign-panel');
  await cosign.getByRole('button', { name: 'Co-sign' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Co-sign' }).click();
  await expect(cosign).toContainText('No verbal orders waiting');

  await page.getByRole('button', { name: 'New order' }).click();
  await page.locator('.sheet.open .row-card', { hasText: 'Urinalysis' }).click();
  await page.locator('.sheet.open .sheet-foot').getByRole('button', { name: 'Send order' }).click();
  await expect(page.locator('.column', { hasText: 'Accepted' })).toContainText('Urinalysis');
});

test('the bar, as the admin navbar: the tabs in it, a patient from the search, and a notification that leads to its result', async ({ page }) => {
  await openClinic(page);
  // Search is an icon among the others; its panel opens with the field in focus, Escape closes it back to the icon
  const searchButton = page.getByRole('button', { name: 'Search', exact: true });
  await searchButton.click();
  const field = page.getByRole('combobox', { name: 'Search owners, phone numbers, pets or visit codes' });
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(searchButton).toBeFocused();

  await page.keyboard.press('Control+K');
  await field.fill('nala');
  await expectAccessible(page, 'search', '.navbar');
  // The pet in today's queue comes first, then its appointments
  await page.getByRole('option', { name: /^Nala/ }).first().click();
  await expect(page.locator('.sheet.open').getByRole('heading', { name: 'Quick view · Nala' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Notifications/ }).click();
  const menu = page.getByRole('menu', { name: 'Notifications' });
  await expect(menu.getByRole('menuitem').first()).toBeVisible();
  await expectAccessible(page, 'notifications');
  await menu.getByRole('menuitem', { name: /Nala · Potassium Critical value/ }).click();
  await expect(page).toHaveURL('/clinic/results');
  await expect(page.locator('.sheet.open')).toContainText('Potassium');
  await page.keyboard.press('Escape');

  // The language: one button with the language in use on it; a press switches to the other
  await page.getByRole('button', { name: 'EN · Switch to Thai' }).click();
  await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /^ผลตรวจ/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'TH · เปลี่ยนเป็นภาษาอังกฤษ' }).click();
  await expect(page.getByRole('button', { name: 'EN · Switch to Thai' })).toBeVisible();
});

test('display size: one button steps the whole UI up and back, stays under the pointer, says the size in its tooltip, and is kept', async ({ page }) => {
  await start(page);
  await signInAs(page, 'Administrator');

  /** The app's zoom, whether the workspace fits the window exactly, and where the open menu is against its button */
  const zoom = () => page.locator('app-root').evaluate(root => getComputedStyle(root).zoom);
  const fillsWindow = () => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth);
  const menuUnder = (button: ReturnType<Page['locator']>) => button.evaluate(element => {
    const b = element.getBoundingClientRect();
    const m = document.querySelector('.cdk-overlay-pane .ui-menu')!.getBoundingClientRect();
    return m.top >= b.bottom && m.top - b.bottom < 12 && Math.abs(m.right - b.right) < 2;
  });

  // The admin navbar: resting on the button tells the size; pressed twice from the same spot, 110% then 125%. While the
  // pointer stays on it the bar's controls keep their size, so the second press still lands on the button.
  const adminSize = page.locator('app-navbar').getByRole('button', { name: /^Display size/ });
  const tooltip = page.locator('app-navbar .ui-tooltip-panel');
  const box = (await adminSize.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await expect(tooltip).toHaveText(/^Display size 100%\s*Press to switch to 110%$/);
  await page.mouse.click(x, y);
  await expect.poll(zoom).toBe('1.1');
  await expect(tooltip).toHaveText(/^Display size 110%\s*Press to switch to 125%$/);
  await expect(adminSize).toHaveAccessibleName('Display size 110% · Press to switch to 125%');
  await page.mouse.click(x, y);
  await expect.poll(zoom).toBe('1.25');
  await expect(tooltip).toHaveText(/^Display size 125%\s*Press to switch to 100%$/);
  expect((await adminSize.boundingBox())!.width).toBeCloseTo(box.width, 0);
  // Escape hides it, with the pointer still on the button (WCAG 1.4.13)
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  // The pointer gone, the controls take the size of the rest
  await page.mouse.move(10, 400);
  await expect.poll(async () => Math.round((await adminSize.boundingBox())!.width)).toBe(Math.round(box.width * 1.25));
  // The admin pages scroll down as long as they are, never sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Kept in the clinical workspace, where it fills the window, and its menus still open under their button
  await page.locator('.user-button').click();
  await expect(menuUnder(page.locator('.user-button'))).resolves.toBe(true);
  await page.getByRole('menuitem', { name: 'Clinical work' }).click();
  await expect(page).toHaveURL('/clinic/queue');
  expect(await zoom()).toBe('1.25');
  // Once the route has settled
  await expect.poll(fillsWindow).toBe(true);
  await expectAccessible(page, 'the clinic at 125%');

  // From the keyboard: the tooltip shows on focus, and Enter steps back to 100%
  const clinicSize = page.locator('.clinic .navbar').getByRole('button', { name: 'Display size 125% · Press to switch to 100%' });
  await page.locator('.clinic .language-button').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(clinicSize).toBeFocused();
  await expect(page.locator('.clinic .ui-tooltip-panel')).toHaveText(/^Display size 125%/);
  await page.keyboard.press('Enter');
  await expect.poll(zoom).toBe('1');
  await page.keyboard.press('Enter');
  await expect.poll(zoom).toBe('1.1');

  // After a reload too, from before the app starts
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-zoom'))).toBe('1.1');
  await expect(page.locator('.clinic .navbar').getByRole('button', { name: 'Display size 110% · Press to switch to 125%' })).toBeVisible();
});
