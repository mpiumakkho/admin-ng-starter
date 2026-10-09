/**
 * A UUID version 7 (RFC 9562), as admin-api-starter gives its records: the first 48 bits are the time in
 * milliseconds, the rest random, so ids sort by when they were made. The first 8 characters change only about once a
 * minute, so ids made close together start alike: never shorten one to its start.
 *
 * @param randomBytes fills the random part; the sample data passes a seeded one, to be the same on every first load
 */
export function uuidV7(time = Date.now(), randomBytes: (bytes: Uint8Array<ArrayBuffer>) => void = bytes => crypto.getRandomValues(bytes)): string {
  const bytes = new Uint8Array(16);
  randomBytes(bytes.subarray(6));
  let ms = Math.max(0, Math.floor(time));
  for (let index = 5; index >= 0; index--) {
    bytes[index] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  // Version 7, and the RFC 9562 variant
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
