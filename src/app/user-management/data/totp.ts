/*
 * Time-based one-time codes (RFC 6238), as authenticator apps such as Google Authenticator make them:
 * a shared secret, a 30-second step and 6 digits. LocalAdminApi uses this the way a server would.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

/** A new random secret, in the base32 form people type into an authenticator app */
export function createSecret(bytes = 20): string {
  return toBase32(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The address an authenticator app reads from the QR code */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** The code for a moment, 6 digits by default */
export async function totp(secret: string, time = Date.now(), digits = DIGITS): Promise<string> {
  const counter = Math.floor(time / 1000 / STEP_SECONDS);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', fromBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  // Dynamic truncation: 31 bits from an offset the last byte picks
  const offset = hash[hash.length - 1] & 0x0f;
  const value = new DataView(hash.buffer).getUint32(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, '0');
}

/** Whether a code matches now, or one step either side, since phone clocks drift */
export async function verifyTotp(secret: string, code: string, time = Date.now()): Promise<boolean> {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) {
    return false;
  }
  for (const step of [0, -1, 1]) {
    if (await totp(secret, time + step * STEP_SECONDS * 1000) === typed) {
      return true;
    }
  }
  return false;
}

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
}

export function fromBase32(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      throw new Error('Not base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}
