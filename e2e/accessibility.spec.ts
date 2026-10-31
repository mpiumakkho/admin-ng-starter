import { expect, test } from '@playwright/test';

import { expectAccessible, signInAs, signOut, start } from './helpers';

/** Every page an administrator can open, and what shows once it has loaded */
const PAGES = [
  { path: '/overview', ready: 'ui-chart canvas' },
  { path: '/users', ready: '.users-table tbody tr' },
  { path: '/users/u-002', ready: '.profile-name' },
  { path: '/users/u-002?tab=security', ready: '.device' },
  { path: '/users/new', ready: '#firstName' },
  { path: '/roles', ready: 'ui-page-header' },
  { path: '/roles/conflicts', ready: '.rules-table tbody tr' },
  { path: '/branches', ready: '.branches-table tbody tr' },
  { path: '/activity', ready: '.log tbody tr' },
  { path: '/settings', ready: '#defaultRoleId' },
  { path: '/ui-kit', ready: 'ui-page-header' },
  { path: '/clinic/queue', ready: '.queue-table tbody tr' },
  { path: '/clinic/appointments', ready: '.board .task' },
  { path: '/clinic/encounter', ready: '.patient-banner' },
  { path: '/clinic/orders', ready: '.board .task' },
  { path: '/clinic/results', ready: '.board .task' },
  { path: '/clinic/dispense', ready: '.board .task' },
  { path: '/clinic/ward', ready: '.bed.taken' },
  { path: '/backoffice/home/overview', ready: '.bo-table tbody tr' },
  { path: '/backoffice/home/approvals', ready: '.bo-table tbody tr' },
  { path: '/backoffice/home/alerts', ready: '.bo-table tbody tr' },
  { path: '/backoffice/home/activity', ready: '.bo-table tbody tr' },
  { path: '/error-pages/404', ready: '.error-code' },
  { path: '/error-pages/500', ready: '.error-code' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test('the sign-in pages', async ({ page }) => {
      await start(page, '/login', theme);
      await expect(page.locator('.demo-account').first()).toBeVisible();
      await expectAccessible(page);
      await page.goto('/forgot-password');
      await expect(page.locator('#resetEmail')).toBeVisible();
      await expectAccessible(page);
      await page.goto('/reset-password?token=sample');
      await expect(page.locator('#newPassword')).toBeVisible();
      await expectAccessible(page);
    });

    test('every page', async ({ page }) => {
      test.setTimeout(90_000);
      await start(page, '/login', theme);
      await signInAs(page, 'Administrator');
      for (const { path, ready } of PAGES) {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible();
        await expectAccessible(page, path);
      }
    });

    test('menus and dialogs', async ({ page }) => {
      await start(page, '/login', theme);
      await signInAs(page, 'Administrator');

      await page.locator('.user-button').click();
      await expect(page.getByRole('menuitem', { name: 'Sign Out' })).toBeVisible();
      await expectAccessible(page, 'the account menu');
      await page.getByRole('menuitem', { name: 'Security and devices' }).click();
      await page.getByRole('button', { name: 'Turn on' }).click();
      await expect(page.locator('dialog[open] .qr img')).toBeVisible();
      await expectAccessible(page, 'the two-step sign-in dialog');
      await page.keyboard.press('Escape');

      await page.goto('/users?role=support');
      const rows = page.locator('.users-table tbody tr');
      await rows.nth(0).getByRole('checkbox').check();
      await rows.nth(1).getByRole('checkbox').check();
      await expectAccessible(page, 'the users list with people selected');
      await page.locator('ui-bulk-bar').getByRole('button', { name: 'Give role' }).click();
      await expect(page.locator('dialog[open] select[id$="-role"]')).toBeVisible();
      await expectAccessible(page, 'the give role dialog');
      await page.keyboard.press('Escape');

      await page.goto('/users/u-002?tab=roles');
      await expect(page.locator('.assignments')).toBeVisible();
      await expectAccessible(page, 'the roles of a profile');
    });

    test('the two-step sign-in setup page', async ({ page }) => {
      await start(page, '/login', theme);
      await signInAs(page, 'Administrator');
      await page.goto('/settings?section=sign-in');
      await page.getByRole('group', { name: 'Two-step sign-in required for' }).getByRole('checkbox', { name: 'Viewer' }).check();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.locator('ui-toaster')).toContainText('Settings saved.');
      await signOut(page);

      await signInAs(page, 'Viewer');
      await expect(page).toHaveURL('/setup-two-factor');
      await expectAccessible(page);
    });
  });
}
