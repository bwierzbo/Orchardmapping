import { describe, it, expect, vi, afterEach } from 'vitest';
import { nowLocalIso, resolveTimezone } from './openmeteo';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('nowLocalIso', () => {
  it('renders a naive local ISO string with no zone suffix', () => {
    const iso = nowLocalIso('America/Los_Angeles');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(iso).not.toMatch(/[Zz+]/);
  });

  it('reads the same instant differently in each orchard clock', () => {
    // 2026-06-15 03:30 UTC — deliberately in the window where the three
    // zones fall on different calendar days, which is the bug this fixes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T03:30:00Z'));

    expect(nowLocalIso('America/Los_Angeles')).toBe('2026-06-14T20:30');
    expect(nowLocalIso('America/Detroit')).toBe('2026-06-14T23:30');
    expect(nowLocalIso('Europe/London')).toBe('2026-06-15T04:30');
  });

  it('gives a UK orchard its own date, not the Pacific one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T03:30:00Z'));
    // A spray logged at 4:30am in Herefordshire belongs to the 15th.
    // Under the old hardcoded Pacific zone it was filed on the 14th.
    expect(nowLocalIso('Europe/London').slice(0, 10)).toBe('2026-06-15');
    expect(nowLocalIso('America/Los_Angeles').slice(0, 10)).toBe('2026-06-14');
  });
});

describe('resolveTimezone', () => {
  it('returns the zone the service reports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ timezone: 'America/Detroit' }) }))
    );
    expect(await resolveTimezone(42.3, -83.0)).toBe('America/Detroit');
  });

  it('asks for the zone at those exact coordinates', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ timezone: 'Europe/London' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await resolveTimezone(52.06, -2.72);
    const url = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('latitude=52.06');
    expect(url).toContain('longitude=-2.72');
    expect(url).toContain('timezone=auto');
  });

  it('returns null rather than guessing when the service fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await resolveTimezone(48.1, -123.2)).toBeNull();
  });

  it('returns null when the service answers without a zone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await resolveTimezone(48.1, -123.2)).toBeNull();
  });

  it('returns null when the network throws, so creation fails loudly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await resolveTimezone(48.1, -123.2)).toBeNull();
  });
});
