import { uuidV7 } from './uuid';

describe('uuidV7', () => {
  it('starts with the time and carries version 7 and the RFC 9562 variant', () => {
    const time = Date.UTC(2026, 9, 9, 7, 30);
    const id = uuidV7(time, bytes => bytes.fill(0xff));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(time);
    expect(id.slice(14)).toBe('7fff-bfff-ffffffffffff');
  });

  it('sorts by time, and differs within the same millisecond', () => {
    const earlier = uuidV7(1_000);
    const later = uuidV7(2_000);
    expect(earlier < later).toBe(true);
    expect(uuidV7(1_000)).not.toBe(uuidV7(1_000));
  });
});
