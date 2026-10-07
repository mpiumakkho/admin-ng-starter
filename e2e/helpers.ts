import { createHmac } from 'node:crypto';

import { expect, Page } from '@playwright/test';

export type SampleRole = 'Administrator' | 'Manager' | 'Support' | 'Viewer';

/** Opens the app in English, with nothing saved from an earlier run */
export async function start(page: Page, path = '/login') {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear();
      localStorage.setItem('language', 'en');
      sessionStorage.setItem('e2e-started', '1');
    }
  });
  await page.goto(path);
}

/** Signs in with the sample account for a role, from the buttons on the sign-in page */
export async function signInAs(page: Page, role: SampleRole) {
  await page.locator('.demo-account', { hasText: role }).click();
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
