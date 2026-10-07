import { describe, it, expect } from 'vitest';
import { photosFromEvents } from './tree-photos';

const ev = (
  photo_url: string | null,
  event_date: string | null,
  extra: Partial<{ created_at: string | null; event_type: string; detail: string | null }> = {},
) => ({
  photo_url,
  event_date,
  created_at: extra.created_at ?? null,
  event_type: extra.event_type ?? 'observation',
  detail: extra.detail ?? null,
});

describe('photosFromEvents', () => {
  it('keeps only the events that carry a photo', () => {
    const out = photosFromEvents([
      ev('a.jpg', '2026-05-01'),
      ev(null, '2026-06-01'),
      ev('b.jpg', '2026-07-01'),
    ]);
    expect(out.map((p) => p.url)).toEqual(['b.jpg', 'a.jpg']);
  });

  it('puts the newest first', () => {
    const out = photosFromEvents([
      ev('old.jpg', '2024-09-01'),
      ev('new.jpg', '2026-09-01'),
      ev('mid.jpg', '2025-09-01'),
    ]);
    expect(out.map((p) => p.url)).toEqual(['new.jpg', 'mid.jpg', 'old.jpg']);
  });

  it('falls back to created_at when the event carried no date', () => {
    const out = photosFromEvents([ev('a.jpg', null, { created_at: '2026-03-02' })]);
    expect(out[0].date).toBe('2026-03-02');
  });

  it('prefers the date the user gave over when the row landed', () => {
    // A harvest logged in December for a September pick belongs in September.
    const out = photosFromEvents([
      ev('a.jpg', '2026-09-15', { created_at: '2026-12-01' }),
    ]);
    expect(out[0].date).toBe('2026-09-15');
  });

  it('sorts a photo with no date at all to the end', () => {
    const out = photosFromEvents([ev('none.jpg', null), ev('dated.jpg', '2020-01-01')]);
    expect(out.map((p) => p.url)).toEqual(['dated.jpg', 'none.jpg']);
  });

  it('shows the same photo once, keeping the earlier use', () => {
    // Re-attaching a photo to a later event does not make it a new one.
    const out = photosFromEvents([
      ev('same.jpg', '2026-08-01', { detail: 'reused' }),
      ev('same.jpg', '2026-05-01', { detail: 'taken here' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-05-01');
    expect(out[0].detail).toBe('taken here');
  });

  it('carries the event type and detail through for the caption', () => {
    const out = photosFromEvents([
      ev('a.jpg', '2026-05-01', { event_type: 'fruit_check', detail: '12 drops' }),
    ]);
    expect(out[0]).toMatchObject({ eventType: 'fruit_check', detail: '12 drops' });
  });

  it('ignores a blank or whitespace url', () => {
    expect(photosFromEvents([ev('', '2026-01-01'), ev('   ', '2026-01-02')])).toEqual([]);
  });

  it('returns nothing for a tree with no events', () => {
    expect(photosFromEvents([])).toEqual([]);
  });
});
