import { createHmac } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

export type SampleRole = 'Administrator' | 'Manager' | 'Support' | 'Viewer' | 'Branch manager';

/** Opens the app in English, with nothing saved from an earlier run, in the light theme unless asked otherwise */
export async function start(page: Page, path = '/login', theme: 'light' | 'dark' = 'light') {
  await page.addInitScript(theme => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear();
      localStorage.setItem('language', 'en');
      localStorage.setItem('theme', theme);
      sessionStorage.setItem('e2e-started', '1');
    }
  }, theme);
  await page.goto(path);
}

/** Signs in with the sample account for a role, from the buttons on the sign-in page; "Manager" is not "Branch manager" */
export async function signInAs(page: Page, role: SampleRole) {
  await page.locator('.demo-account').getByText(role, { exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page) {
  await page.locator('.user-button').click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Every page in the sidebar, at the top or in a group, in order */
export function menu(page: Page) {
  return page.locator('#sidebar a.nav-link:not(.navbar-brand)');
}

/** The code an authenticator app would show now for a base32 secret (RFC 6238: SHA-1, 30 seconds, 6 digits) */
export function totp(secret: string, time = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/\s/g, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Checks what is on screen against WCAG 2.2 AA with axe: names, roles, labels, contrast and the rest. Colors are read
 * once transitions and entry animations have ended; endless ones, such as a spinner, are left running. `within` limits
 * the check to one part, such as a panel open over the page: what it covers is checked elsewhere, with nothing over it.
 */
export async function expectAccessible(page: Page, label = new URL(page.url()).pathname, within?: string) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity))
    .map(animation => animation.finished.catch(() => undefined))));
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  const { violations } = await (within ? axe.include(within) : axe).analyze();
  const found = violations.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join(', ')})`);
  expect(found, `accessibility of ${label}`).toEqual([]);
}
