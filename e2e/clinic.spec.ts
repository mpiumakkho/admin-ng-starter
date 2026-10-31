import { expect, Page, test } from '@playwright/test';

import { expectAccessible, signInAs, start } from './helpers';

const TABS = [
  { link: 'Queue', heading: "Today's queue" },
  { link: 'Appointments', heading: 'Appointments' },
  { link: 'Register', heading: 'New patient' },
  { link: 'Encounter', heading: 'SOAP' },
  { link: 'Orders', heading: 'Orders' },
  { link: 'Results', heading: 'Results Inbox' },
  { link: 'Dispense', heading: 'Dispense' },
  { link: 'Ward', heading: 'Ward' },
];

async function openClinic(page: Page) {
  await start(page);
  await signInAs(page, 'Administrator');
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Clinical work' }).click();
  await expect(page).toHaveURL('/clinic/queue');
}

test('the clinical workspace opens from the account menu, fills the page, and every tab works', async ({ page }) => {
  // Eight tabs, each checked with axe: more than the usual half minute when the suite runs in parallel
  test.slow();
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
  await expect(page.locator('.queue-table tbody tr')).toHaveCount(9);

  await page.locator('.rail-btn').first().click();
  await expect(page.locator('.sheet.open .sheet-tabs button[aria-pressed="true"]')).toHaveText('Clinical alerts');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet.open')).toHaveCount(0);
});

test('the context rail: who it is about, the owner\'s balance, a past visit and its document, and a pet picked on a board', async ({ page }) => {
  await openClinic(page);
  const rail = page.getByRole('complementary', { name: 'Context rail' });
  // Bolt is selected: his avatar on top, his owner's unpaid bill counted
  await expect(rail.locator('.rail-subject')).toHaveAttribute('title', 'Bolt · HN-240118 · Patcharee L.');
  await rail.getByRole('button', { name: /^Billing \/ balance: 1/ }).click();
  const sheet = page.locator('.sheet.open');
  await expect(sheet).toContainText('INV-2609-0112');
  await expect(sheet).toContainText('฿1,450');
  await expectAccessible(page, 'billing sheet');

  // Visit history leads to a past visit, and the visit to its document
  await rail.getByRole('button', { name: /^Visit history/ }).click();
  await sheet.locator('button.row-card', { hasText: '2026-09-11' }).click();
  await expect(sheet.getByRole('heading', { name: 'Visit · 2026-09-11' })).toBeVisible();
  await sheet.locator('button.row-card', { hasText: 'Lameness report' }).click();
  await expect(sheet.getByRole('button', { name: 'Download details' })).toBeEnabled();
  await page.keyboard.press('Escape');

  // A result on the board selects its pet: Nala, whose potassium is critical
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Results/ }).click();
  await page.locator('.task', { hasText: 'Nala' }).first().click();
  await page.keyboard.press('Escape');
  await expect(rail.locator('.rail-subject')).toHaveAttribute('title', /^Nala/);
  await expect(rail.getByRole('button', { name: /^Results preview: 1/ }).locator('.badge.danger')).toHaveText('1');

  // Khao Niao's owner has not signed the consent: "!" on its button, and the consent tab says so
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Queue/ }).click();
  await page.locator('.queue-table tbody tr', { hasText: 'Khao Niao' }).click();
  await page.keyboard.press('Escape');
  await rail.getByRole('button', { name: /^Consent \/ PDPA: needs action/ }).click();
  await expect(sheet).toContainText('Consent waiting to be signed');
});

test('the encounter: steps, a signature that locks S/O/A/P, and no drug the pet is allergic to', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Encounter/ }).click();
  await expect(page.locator('.patient-banner')).toContainText('Bolt');

  // Prescribing beside the safety check: Bolt is allergic to amoxicillin (penicillins), so it needs a senior vet's
  // override; carprofen's dose is worked out from his 9.8 kg; tramadol passes
  await page.locator('.step-btn', { hasText: 'Medication' }).click();
  await page.getByRole('button', { name: 'New prescription' }).click();
  const sheet = page.locator('.sheet.open');
  const prescribe = sheet.locator('.sheet-foot button').last();
  await sheet.locator('#rx-drug').selectOption('Amoxicillin 250 mg');
  await expect(sheet).toContainText('Runs into a clinical alert');
  await expect(prescribe).toHaveText('Override and prescribe');
  await expect(prescribe).toBeDisabled();
  await sheet.locator('#rx-reason').fill('No other option, the owner was told');
  await expect(prescribe).toBeDisabled();
  await sheet.locator('#rx-senior').selectOption({ index: 1 });
  await sheet.getByRole('checkbox').check();
  await expect(prescribe).toBeEnabled();

  await sheet.locator('#rx-drug').selectOption('Tramadol 50 mg');
  await expect(sheet.locator('#rx-dose')).toHaveValue('0.75');
  await expect(sheet.locator('#rx-qty')).toHaveValue('8 tablets');
  await expect(sheet).toContainText('Passed the CDS check');
  await sheet.locator('#rx-dose').fill('3');
  await expect(sheet).toContainText('More than twice the reference range');
  await sheet.locator('#rx-dose').fill('0.75');
  await expect(sheet).toContainText('In range');
  await prescribe.click();
  await expect(page.locator('ui-toaster')).toContainText('Tramadol 50 mg prescribed for Bolt');
  await expect(page.locator('.form-panel')).toContainText('Tramadol 50 mg');
  const dialog = page.locator('dialog[open]');

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

test('dispense: a prescription is verified, prepared from the batch that expires first, and handed over', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Dispense/ }).click();
  await page.locator('.column', { hasText: 'Verify' }).locator('.task', { hasText: 'Bolt' }).click();
  const foot = page.locator('.sheet.open .sheet-foot');
  const dialog = page.locator('dialog[open]');

  // Verify: every right ticked before it goes on
  await foot.getByRole('button', { name: 'Verify prescription' }).click();
  const verified = dialog.getByRole('button', { name: 'Verified · send to prepare' });
  await expect(verified).toBeDisabled();
  for (const box of await dialog.getByRole('checkbox').all()) {
    await box.check();
  }
  await verified.click();
  await expect(page.locator('.column', { hasText: 'Prepare' })).toContainText('Bolt');

  // Prepare: the batch that expires first (11/2026) is picked, and its stock goes down by the 10 tablets
  await foot.getByRole('button', { name: 'Prepare' }).click();
  await expect(dialog.locator('select')).toHaveValue('B-2312-04');
  await dialog.getByRole('checkbox', { name: 'Print the label now' }).uncheck();
  await dialog.getByRole('button', { name: 'Prepared' }).click();
  await expect(page.locator('.sheet.open')).toContainText('Dispensed from this batch');
  await expect(page.locator('.sheet.open tr', { hasText: 'B-2312-04' })).toContainText('30 tablets');

  // Counsel and hand over: told and said back, then it leaves the board and Bolt's dispensing is done
  await foot.getByRole('button', { name: 'Counsel and hand over' }).click();
  await expect(dialog.getByLabel('Received by')).toHaveValue('Patcharee L.');
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('checkbox').last().check();
  await dialog.getByRole('button', { name: 'Hand over' }).click();
  await expect(page.locator('ui-toaster')).toContainText('handed over to Patcharee L.');
  await expect(page.locator('.column', { hasText: 'Dispensed' })).toContainText('Bolt');
});

test('estimate and consent: signed on the screen before a witness, and approved again once the visit grows', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Encounter/ }).click();
  await page.locator('.step-btn', { hasText: 'Orders' }).click();
  await page.getByRole('button', { name: 'Consent', exact: true }).click();

  // Bolt's estimate was approved at check-in; the consent waits for the owner's signature and a witness
  const sheet = page.locator('.sheet.open');
  const save = sheet.getByRole('button', { name: 'Record the signature' });
  await sheet.getByRole('checkbox').nth(0).check();
  await sheet.getByRole('checkbox').nth(1).check();
  await sheet.locator('#consent-witness').selectOption({ index: 1 });
  await expect(save).toBeDisabled();
  const box = (await sheet.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 100, { steps: 8 });
  await page.mouse.move(box.x + 240, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await save.click();
  await expect(sheet).toContainText('Signed 11:32 · Patcharee L. (Owner)');
  await expect(sheet.locator('img.sig-image')).toBeVisible();
  await expect(page.locator('.handoff')).toContainText('Signed 11:32');

  // A new drug takes the visit past what was approved: the owner approves again
  await page.keyboard.press('Escape');
  await page.locator('.step-btn', { hasText: 'Medication' }).click();
  await page.getByRole('button', { name: 'New prescription' }).click();
  await sheet.locator('#rx-drug').selectOption('Omeprazole 10 mg');
  await sheet.locator('.sheet-foot button').last().click();
  await page.locator('.step-btn', { hasText: 'Orders' }).click();
  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await expect(sheet).toContainText('The cost is past what the owner approved');
  await expect(sheet).toContainText('Omeprazole 10 mg');
  await sheet.getByRole('button', { name: 'Approve again' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Record the approval' }).click();
  await expect(sheet.getByRole('button', { name: 'View consent' })).toBeVisible();
  await expect(sheet).not.toContainText('The cost is past what the owner approved');
});

test('discharge: held until the follow-up is booked, then the pet goes home with a bill the owner pays', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Encounter/ }).click();
  const dialog = page.locator('dialog[open]');
  await page.getByRole('button', { name: 'Sign SOAP' }).click();
  await dialog.getByRole('button', { name: 'Sign' }).click();
  await page.locator('.step-btn', { hasText: 'Discharge' }).click();
  await expect(page.locator('.discharge-checks li.req')).toContainText('Follow-up booked');

  // The plan says a week: booked for 1 October with Bolt's vet
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(dialog.getByLabel('Date (YYYY-MM-DD)')).toHaveValue('2026-10-01');
  await dialog.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.locator('.row-card.followup')).toContainText('Booked');
  await expect(page.locator('.discharge-checks li.req')).toHaveCount(0);

  // Discharge: the record locks, Bolt moves to the discharge stage, and the day's bill is issued
  await page.locator('.handoff').getByRole('button', { name: 'Discharge' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Close the encounter and discharge' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Bolt discharged · invoice INV-2609-0159 ฿1,670');
  await expect(page.locator('.readonly-banner')).toBeVisible();
  await expect(page.locator('.handoff')).toContainText('Waiting for payment ฿1,670');

  // The owner pays at the desk
  await page.getByRole('button', { name: /^Billing/ }).first().click();
  const invoice = page.locator('.sheet.open details', { hasText: 'INV-2609-0159' });
  await invoice.locator('summary').click();
  await invoice.getByRole('button', { name: 'Take payment' }).click();
  await dialog.getByRole('checkbox', { name: 'Print receipt' }).uncheck();
  await dialog.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.locator('.handoff')).toContainText('Paid 11:32');
});

test('the record kept up: steps by what is filled in, vitals over time, an addendum, a resolved problem and a vaccine given', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Encounter/ }).click();
  const dialog = page.locator('dialog[open]');

  // The steps say what is filled in, not where they sit: Bolt's vitals are taken
  await expect(page.locator('.step-btn', { hasText: 'Vitals' })).toContainText('Complete');

  // Vitals: the two earlier visits and today's, and today's kept as a timed set
  await page.locator('.step-btn', { hasText: 'Vitals' }).click();
  await expect(page.locator('.vitals-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.vitals-table .spark').first()).toBeVisible();
  await page.getByRole('button', { name: 'Record this set of vitals' }).click();
  await expect(page.locator('ui-toaster')).toContainText("Bolt's vitals recorded");

  // After the signature, a change is an addendum below the note
  await page.getByRole('button', { name: 'Sign SOAP' }).click();
  await dialog.getByRole('button', { name: 'Sign' }).click();
  await page.locator('.step-btn', { hasText: 'SOAP' }).click();
  await page.getByRole('button', { name: 'Add addendum' }).click();
  await dialog.getByLabel('Addendum').fill('X-ray shows no fracture; soft-tissue injury confirmed');
  await dialog.getByRole('button', { name: 'Save addendum' }).click();
  await expect(page.locator('.addendum')).toContainText('X-ray shows no fracture');

  // A problem resolved stays on the list; a due vaccine is given with its lot
  await page.getByRole('button', { name: /^Problem list/ }).click();
  const sheet = page.locator('.sheet.open');
  await sheet.locator('.row-card', { hasText: 'Right hind limb lameness' }).getByRole('button', { name: 'Edit' }).click();
  await dialog.getByLabel('Status').selectOption('ok');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.row-card', { hasText: 'Right hind limb lameness' })).toContainText('Resolved');
  await sheet.locator('.sheet-tabs').getByRole('button', { name: 'Vaccines / reminders' }).click();
  await sheet.locator('.row-card', { hasText: 'Leptospirosis' }).getByRole('button', { name: 'Give today' }).click();
  await dialog.getByLabel('Lot / Batch').fill('LP-2608-02');
  await dialog.getByRole('button', { name: 'Record dose' }).click();
  await expect(sheet.locator('.row-card', { hasText: 'Leptospirosis' })).toContainText('Current');
  await expect(sheet).toContainText('Lot LP-2608-02');
});

test('the ward: a late dose recorded as refused, a due one given at the cage, a drip changed and stopped, a verbal order co-signed, and the pet leaves its bed', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Ward/ }).click();
  const dialog = page.locator('dialog[open]');
  const sheet = page.locator('.treatment-sheet');

  // The bed map: Mali's bed says a dose is late; her sheet opens from it
  const mali = page.locator('.bed.taken', { hasText: 'Mali' });
  await expect(mali).toContainText('1 late');
  await mali.click();
  await expect(sheet).toContainText('Treatment sheet · Mali');
  await expect(sheet.locator('.mar-table tr', { hasText: 'Omeprazole' })).toContainText('Held');
  await expectAccessible(page, 'ward');

  // The late metronidazole: refused, with why; a dose not given needs a reason
  await sheet.locator('.mar-table button.chip', { hasText: 'min late' }).click();
  await dialog.getByLabel('Outcome').selectOption({ label: 'Refused / vomited' });
  const save = dialog.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Why it was not given').selectOption({ label: 'Vomited after the dose' });
  await save.click();
  await expect(sheet.locator('.mar-table tr', { hasText: 'Metronidazole' })).toContainText('Refused');
  await expect(sheet.locator('.dose-log')).toContainText('Vomited after the dose');
  await expect(mali).not.toContainText('late');

  // Mochi's omeprazole is due: the five rights, then given
  await page.locator('.bed.taken', { hasText: 'Mochi' }).click();
  await sheet.locator('.mar-table tr', { hasText: 'Omeprazole' }).getByRole('button', { name: 'Give' }).click();
  await expect(save).toBeDisabled();
  for (const box of await dialog.getByRole('checkbox').all()) {
    await box.check();
  }
  await save.click();
  await expect(sheet.locator('.mar-table tr', { hasText: 'Omeprazole' })).toContainText('11:32');

  // The drip: a new rate, paused, then stopped for good
  const line = sheet.locator('.lines-table tr', { hasText: 'LRS' });
  await line.getByRole('button', { name: 'Rate' }).click();
  await dialog.getByLabel('New rate (mL/hr)').fill('15');
  await dialog.getByRole('button', { name: 'Rate' }).click();
  await expect(line).toContainText('15');
  await line.getByRole('button', { name: 'Pause' }).click();
  await expect(line).toContainText('Paused');
  await line.getByRole('button', { name: 'Resume' }).click();
  await expect(line).toContainText('Running');

  // A verbal order the nurse writes down: a draft the vet co-signs on the orders board, then on the sheet awaiting the pharmacy
  await sheet.getByRole('button', { name: 'Take a verbal order' }).click();
  await dialog.getByLabel('Drug').selectOption({ label: 'Ondansetron 2 mg' });
  await dialog.getByLabel('Dose').fill('1/2 tablet');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Record the verbal order' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Verbal order RX-260924-23 recorded');
  await expect(sheet.locator('.mar-table')).not.toContainText('Ondansetron');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Orders/ }).click();
  const cosign = page.locator('.cosign-panel tr', { hasText: 'Mochi' });
  await expect(cosign).toContainText('Given on the ward');
  await cosign.getByRole('button', { name: 'Co-sign' }).click();
  await dialog.getByRole('button', { name: 'Co-sign' }).click();
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Ward/ }).click();
  await expect(sheet.locator('.mar-table tr', { hasText: 'Ondansetron' })).toContainText('Awaiting pharmacy check');

  // Leaving the ward waits for the drip to be stopped; then the bed waits to be cleaned, and the pet is at the discharge desk
  await sheet.getByRole('button', { name: 'Leave the ward' }).click();
  await expect(dialog).toContainText('1 lines still running');
  await expect(dialog.getByRole('button', { name: 'Leave the ward' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await line.getByRole('button', { name: 'Stop', exact: true }).click();
  await dialog.getByRole('button', { name: 'Stop the line' }).click();
  await expect(line).toContainText('Stopped');
  await sheet.getByRole('button', { name: 'Leave the ward' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Leave the ward' }).click();
  await expect(page.locator('ui-toaster')).toContainText('Mochi has left C-02');
  const bed = page.locator('.bed', { hasText: 'C-02' });
  await expect(bed).toContainText('To be cleaned');
  await bed.getByRole('button', { name: 'Cleaned' }).click();
  await expect(bed).toContainText('Free');
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Queue/ }).click();
  await expect(page.locator('.queue-table tbody tr', { hasText: 'Mochi' })).toContainText('Discharge');
});

test('registration: a new pet and owner go to the queue, a pet on file loads read-only, and a duplicate is stopped', async ({ page }) => {
  await openClinic(page);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Register/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New patient' })).toBeVisible();
  const foot = page.locator('.reg-foot');
  const queue = foot.getByRole('button', { name: 'Visit / queue' });
  const register = foot.getByRole('button', { name: 'Register', exact: true });
  await expect(queue).toBeDisabled();
  await expect(foot).toContainText("Required: Pet name · Owner's name · Phone");

  // A new pet of a new owner, with an address, straight to the emergency room
  await page.locator('#reg-pet').fill('Taohu');
  await page.getByRole('button', { name: 'Cat', exact: true }).click();
  await page.locator('#reg-breed').fill('Persian');
  await page.locator('#reg-caution').fill('Bites when restrained');
  // The title is picked; "Other" opens a box for any other
  await page.locator('#reg-honorific').selectOption({ label: 'Other' });
  await page.locator('#reg-honorific-other').fill('Dr.');
  await page.locator('#reg-first').fill('Pim');
  await page.locator('#reg-last').fill('S.');
  await page.locator('#reg-phone').fill('089-555-0101');
  // The address is on the form; the province is picked from the list
  await page.locator('#addr-tambon').fill('Suan Luang');
  await expect(page.locator('.reg-addr-note')).toContainText('The address is incomplete');
  await page.locator('#addr-amphoe').fill('Suan Luang');
  await page.locator('#addr-province').selectOption({ label: 'Bangkok' });
  await page.locator('#addr-zip').fill('10250');
  await expect(page.locator('.reg-addr-note')).toContainText('The current address will be saved');
  await expect(foot).toContainText('Dr. Pim S.');
  await expect(foot).toContainText('Ready to save');
  await expectAccessible(page, 'registration');
  await page.locator('#reg-route').selectOption({ label: 'Emergency room' });
  await queue.click();
  await expect(page).toHaveURL('/clinic/queue');
  await expect(page.locator('ui-toaster')).toContainText("Taohu sent to today's queue");
  await expect(page.locator('.queue-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.queue-table tbody tr', { hasText: 'Taohu' })).toContainText('Emergency room');

  // A pet on file loads read-only; one in today's queue already does not go again
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: /^Register/ }).click();
  await page.locator('#reg-hn').fill('Bolt');
  await page.locator('.reg-hit', { hasText: 'Bolt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Bolt/ })).toBeVisible();
  await expect(page.locator('.reg-objstat')).toContainText('Record loaded · read-only');
  await expect(page.locator('#reg-pet')).toBeDisabled();
  await expect(queue).toBeDisabled();
  await expect(register).toBeDisabled();
  await page.getByRole('button', { name: 'Reset' }).click();

  // The same microchip is the same animal: no new record, only the way to the one on file
  await page.locator('#reg-pet').fill('Lulu');
  await page.locator('#reg-chip').fill('900182000345678');
  await page.locator('#reg-first').fill('Someone');
  await page.locator('#reg-phone').fill('089-000-0000');
  await register.click();
  await expect(page.locator('.reg-block')).toContainText('Matched on Microchip');
  await page.locator('.reg-block').getByRole('button', { name: 'Open the record' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Luna/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reset' }).click();

  // The same name and kind of the same owner asks first; an administrator creates past it, with a reason
  await page.getByRole('searchbox', { name: 'Find an owner' }).fill('Somsak');
  await page.locator('.reg-owner-find .reg-hit', { hasText: 'Somsak W.' }).click();
  await expect(page.locator('.reg-owner-bar')).toContainText('Loaded · Somsak W.');
  await page.locator('#reg-pet').fill('Kiki');
  await page.getByRole('button', { name: 'Cat', exact: true }).click();
  await register.click();
  const dialog = page.getByRole('dialog', { name: 'Possible duplicates — please review' });
  await expect(dialog).toContainText('same owner');
  const create = dialog.getByRole('button', { name: 'Create anyway' });
  await expect(create).toBeDisabled();
  await dialog.getByLabel('Reason for creating a new record (kept on the record)').fill('A second cat, also called Kiki');
  await create.click();
  await expect(page.locator('ui-toaster')).toContainText('Kiki registered');
  await expect(page.getByRole('heading', { level: 1, name: /^Kiki/ })).toBeVisible();
  await expect(foot).toContainText('Registered already');
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
