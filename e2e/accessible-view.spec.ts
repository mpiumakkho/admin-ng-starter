import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { signInAs, signOut, start } from './helpers';

/** Opens the sign-in page and turns on the accessible view with its switch */
async function startAccessible(page: Page, theme: 'light' | 'dark' = 'light') {
  await start(page, '/login', theme);
  const view = page.getByRole('switch', { name: 'Accessible view' });
  await expect(view).toHaveAttribute('aria-checked', 'false');
  await view.click();
  await expect(view).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('body')).toHaveClass(/ui-aaa/);
}

/**
 * Checks what is on screen against WCAG 2.2 AAA as far as tools can: axe with the AAA rules (contrast 7:1 among
 * them), and every control at least 44 by 44 pixels (2.5.5; a link inside a sentence is exempt).
 */
async function expectAAA(page: Page, label = new URL(page.url()).pathname) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity))
    .map(animation => animation.finished.catch(() => undefined))));
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22aa'])
    .analyze();
  const found = violations.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join(', ')})`);
  expect(found, `AAA rules on ${label}`).toEqual([]);

  const small = await page.evaluate(() => {
    const controls = 'button, a[href], input:not([type=hidden]), select, textarea, [role=checkbox], [role=switch], [role=tab], '
      + '[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [tabindex="0"]';
    const found: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(controls)) {
      const style = getComputedStyle(element);
      if ((element.offsetParent === null && style.position !== 'fixed') || style.visibility === 'hidden') {
        continue;
      }
      let box = element.getBoundingClientRect();
      // A native input drawn by its label (checkboxes, switches): the label is what gets clicked
      const label = element.closest('label');
      if (element.matches('input') && label && (style.opacity === '0' || box.width < 2)) {
        const outer = label.getBoundingClientRect();
        const left = Math.min(box.left, outer.left);
        const top = Math.min(box.top, outer.top);
        box = new DOMRect(left, top, Math.max(box.right, outer.right) - left, Math.max(box.bottom, outer.bottom) - top);
      }
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      const sentence = element.matches('a') ? element.closest('p') : null;
      if (sentence && (sentence.textContent ?? '').trim().length > (element.textContent ?? '').trim().length + 10) {
        continue;
      }
      if (box.width < 44 || box.height < 44) {
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30);
        found.push(`${element.tagName.toLowerCase()}.${element.className} ${Math.round(box.width)}x${Math.round(box.height)} "${name}"`);
      }
    }
    return found;
  });
  expect(small, `targets under 44 pixels on ${label}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`the accessible view meets WCAG 2.2 AAA, ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000);
    await startAccessible(page, theme);
    await expectAAA(page, 'sign-in');
    await page.goto('/forgot-password');
    await expectAAA(page);

    await page.goto('/login');
    await signInAs(page, 'Administrator');
    for (const path of ['/overview', '/users', '/users/u-002', '/users/u-001?tab=security', '/users/new', '/roles', '/activity', '/settings']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expectAAA(page, path);
    }
    await page.locator('.user-button').click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Accessible view' })).toHaveAttribute('aria-checked', 'true');
    await expectAAA(page, 'account menu');
  });
}

test('the accessible view is remembered, and turned off from the account menu', async ({ page }) => {
  await startAccessible(page);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/ui-aaa/);
  await signInAs(page, 'Viewer');

  await page.locator('.user-button').click();
  await page.getByRole('menuitemcheckbox', { name: 'Accessible view' }).click();
  await expect(page.locator('body')).not.toHaveClass(/ui-aaa/);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/ui-aaa/);
});

test('in the accessible view, messages stay above the page until dismissed', async ({ page }) => {
  await startAccessible(page);
  await signInAs(page, 'Administrator');
  await page.goto('/settings?section=sign-in');
  await page.locator('#sessionTimeoutMinutes').selectOption({ label: '15 minutes' });
  await page.getByRole('button', { name: 'Save changes' }).click();

  // In the page above the heading, not over the page; still there long after a usual toast fades
  const toast = page.locator('main ui-toaster .ui-toast', { hasText: 'You are signed out after 15 minutes without activity.' });
  await expect(toast).toBeVisible();
  await expectAAA(page, 'messages');
  await page.waitForTimeout(9_000);
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss' }).first().click();
  await expect(toast).toHaveCount(0);
});

test('in the accessible view, a session that ends is signed in again on the same page, keeping what was typed', async ({ context }) => {
  const first = await context.newPage();
  await startAccessible(first);
  await signInAs(first, 'Administrator');
  await first.goto('/users/new');
  await first.locator('#firstName').fill('Kept');
  await first.locator('#lastName').fill('Draft');

  // Signing out in another tab ends the shared session
  const second = await context.newPage();
  await second.goto('/overview');
  await signOut(second);

  const dialog = first.getByRole('dialog', { name: 'Sign in again to carry on' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Password')).toBeFocused();
  await expectAAA(first, 'signing in again');
  await expect(first).toHaveURL('/users/new');
  // Only its own buttons close it
  await first.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);

  // The sample data takes any password long enough; a short one is wrong
  await dialog.getByLabel('Password').fill('short');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog.getByRole('alert')).toContainText('That password is not right.');
  await dialog.getByLabel('Password').fill('demo-password');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog).toBeHidden();

  // Still on the form, with what was typed
  await expect(first).toHaveURL('/users/new');
  await expect(first.locator('#firstName')).toHaveValue('Kept');
  await expect(first.locator('#lastName')).toHaveValue('Draft');
});

test('in the accessible view, going to the sign-in page from the dialog signs out', async ({ context }) => {
  const first = await context.newPage();
  await startAccessible(first);
  await signInAs(first, 'Administrator');
  const second = await context.newPage();
  await second.goto('/overview');
  await signOut(second);

  const dialog = first.getByRole('dialog', { name: 'Sign in again to carry on' });
  await dialog.getByRole('button', { name: 'Go to the sign-in page' }).click();
  await expect(first).toHaveURL('/login?expired=ended');
});

test('in the accessible view, changes made elsewhere wait until asked for', async ({ context }) => {
  const first = await context.newPage();
  await startAccessible(first);
  await signInAs(first, 'Administrator');
  await first.goto('/users');
  await first.locator('.toolbar-search input').fill('held.change');
  await expect(first.locator('.users-table tbody tr')).toHaveCount(0);

  const second = await context.newPage();
  await second.goto('/users/new');
  await second.locator('#firstName').fill('Held');
  await second.locator('#lastName').fill('Change');
  await second.locator('#email').fill('held.change@example.com');
  await second.getByRole('button', { name: 'Add user' }).click();
  await expect(second).not.toHaveURL('/users/new');

  // The list stays as it was until the person asks
  const notice = first.getByRole('status').filter({ hasText: 'Newer changes are waiting' });
  await expect(notice).toBeVisible();
  await expect(first.locator('.users-table tbody tr')).toHaveCount(0);
  await expectAAA(first, 'changes waiting');
  await notice.getByRole('button', { name: 'Show the changes' }).click();
  await expect(notice).toHaveCount(0);
  await expect(first.locator('.users-table tbody tr')).toHaveCount(1);
});
