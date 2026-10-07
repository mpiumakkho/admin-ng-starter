import { createSecret, fromBase32, otpauthUri, toBase32, totp, verifyTotp } from './totp';

// RFC 6238, appendix B: the SHA-1 secret is the ASCII text "12345678901234567890"
const RFC_SECRET = toBase32(new TextEncoder().encode('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test values', async () => {
    expect(await totp(RFC_SECRET, 59_000, 8)).toBe('94287082');
    expect(await totp(RFC_SECRET, 1_111_111_109_000, 8)).toBe('07081804');
    expect(await totp(RFC_SECRET, 2_000_000_000_000, 8)).toBe('69279037');
    expect(await totp(RFC_SECRET, 59_000)).toBe('287082');
  });

  it('accepts the code one step either side, and nothing further', async () => {
    const secret = createSecret();
    const now = 1_700_000_000_000;

    expect(await verifyTotp(secret, await totp(secret, now), now)).toBe(true);
    expect(await verifyTotp(secret, await totp(secret, now - 30_000), now)).toBe(true);
    expect(await verifyTotp(secret, await totp(secret, now + 30_000), now)).toBe(true);
    expect(await verifyTotp(secret, await totp(secret, now - 90_000), now)).toBe(false);
    expect(await verifyTotp(secret, '12345', now)).toBe(false);
  });

  it('turns secrets into base32 and back', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 128]);

    expect(fromBase32(toBase32(bytes))).toEqual(bytes);
    expect(createSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri('ABC', 'ann@example.com', 'Admin')).toBe(
      'otpauth://totp/Admin%3Aann%40example.com?secret=ABC&issuer=Admin&algorithm=SHA1&digits=6&period=30');
  });
});
