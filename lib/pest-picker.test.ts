import { describe, it, expect } from 'vitest';
import { rankPests, splitForPicker, prevalenceRank, TOP_PESTS, type PickablePest } from './pest-picker';

/** The rain shadow library, in its own sort_order, as the DB returns it. */
const RAINSHADOW: PickablePest[] = [
  { key: 'apple_anthracnose', name: 'Apple anthracnose', category: 'disease', prevalence: 'high' },
  { key: 'apple_scab', name: 'Apple scab', category: 'disease', prevalence: 'high' },
  { key: 'european_canker', name: 'European canker', category: 'disease', prevalence: 'moderate' },
  { key: 'powdery_mildew', name: 'Powdery mildew', category: 'disease', prevalence: 'moderate' },
  { key: 'apple_maggot', name: 'Apple maggot', category: 'insect', prevalence: 'high' },
  { key: 'codling_moth', name: 'Codling moth', category: 'insect', prevalence: 'high' },
  { key: 'leafrollers', name: 'Leafrollers', category: 'insect', prevalence: 'high' },
  { key: 'mites', name: 'Spider mites', category: 'mite', prevalence: 'low' },
  { key: 'european_earwig', name: 'European earwig', category: 'beneficial', prevalence: 'beneficial' },
  { key: 'fire_blight', name: 'Fire blight', category: 'disease', prevalence: 'absent' },
];

describe('prevalenceRank', () => {
  it('orders high above moderate above low', () => {
    expect(prevalenceRank('high')).toBeLessThan(prevalenceRank('moderate'));
    expect(prevalenceRank('moderate')).toBeLessThan(prevalenceRank('low'));
  });

  it('puts unassessed above beneficial and absent, because unknown is not unlikely', () => {
    expect(prevalenceRank(null)).toBeLessThan(prevalenceRank('beneficial'));
    expect(prevalenceRank(null)).toBeLessThan(prevalenceRank('absent'));
    expect(prevalenceRank(null)).toBeGreaterThan(prevalenceRank('low'));
  });

  it('treats a prevalence it has never heard of as unassessed, not as best', () => {
    expect(prevalenceRank('catastrophic')).toBe(prevalenceRank(null));
  });
});

describe('rankPests', () => {
  it('puts the rain shadow high-prevalence five first, in library order', () => {
    const ranked = rankPests(RAINSHADOW, {});
    expect(ranked.slice(0, 5).map((p) => p.key)).toEqual([
      'apple_anthracnose',
      'apple_scab',
      'apple_maggot',
      'codling_moth',
      'leafrollers',
    ]);
  });

  it('sinks absent to the very bottom but never drops it', () => {
    const ranked = rankPests(RAINSHADOW, {});
    expect(ranked.at(-1)?.key).toBe('fire_blight');
    expect(ranked).toHaveLength(RAINSHADOW.length);
  });

  it('lets what this orchard actually finds outrank the regional guess', () => {
    // Spider mites are 'low' here, but if you keep finding them, they
    // belong under your thumb.
    const ranked = rankPests(RAINSHADOW, { mites: 7 });
    expect(ranked[0].key).toBe('mites');
  });

  it('promotes even an absent pest once somebody has actually seen it', () => {
    const ranked = rankPests(RAINSHADOW, { fire_blight: 1 });
    expect(ranked[0].key).toBe('fire_blight');
  });

  it('collapses to library order when no region has ranked anything', () => {
    const unranked = RAINSHADOW.map((p) => ({ ...p, prevalence: null }));
    expect(rankPests(unranked, {}).map((p) => p.key)).toEqual(unranked.map((p) => p.key));
  });

  it('is stable — the same inputs never reshuffle the list', () => {
    const once = rankPests(RAINSHADOW, { mites: 2, apple_scab: 2 }).map((p) => p.key);
    const twice = rankPests(RAINSHADOW, { mites: 2, apple_scab: 2 }).map((p) => p.key);
    expect(once).toEqual(twice);
  });

  it('does not mutate the array it was given', () => {
    const before = RAINSHADOW.map((p) => p.key);
    rankPests(RAINSHADOW, { mites: 9 });
    expect(RAINSHADOW.map((p) => p.key)).toEqual(before);
  });
});

describe('splitForPicker', () => {
  it('shows five and hides the rest', () => {
    const { top, rest } = splitForPicker(RAINSHADOW, {});
    expect(top).toHaveLength(TOP_PESTS);
    expect(rest).toHaveLength(RAINSHADOW.length - TOP_PESTS);
    expect([...top, ...rest]).toHaveLength(RAINSHADOW.length);
  });

  it('keeps an already-ticked pest visible even when it ranks below the cut', () => {
    const { top, rest } = splitForPicker(RAINSHADOW, {}, ['fire_blight']);
    expect(top.map((p) => p.key)).toContain('fire_blight');
    expect(rest.map((p) => p.key)).not.toContain('fire_blight');
  });

  it('does not let a pinned pest eat one of the five slots', () => {
    const { top } = splitForPicker(RAINSHADOW, {}, ['fire_blight']);
    // The five that would have shown anyway, plus the pinned one.
    expect(top).toHaveLength(TOP_PESTS + 1);
    expect(top.map((p) => p.key).slice(0, TOP_PESTS)).toEqual([
      'apple_anthracnose',
      'apple_scab',
      'apple_maggot',
      'codling_moth',
      'leafrollers',
    ]);
  });

  it('pinning something already in the top five changes nothing', () => {
    const { top, rest } = splitForPicker(RAINSHADOW, {}, ['apple_scab']);
    expect(top).toHaveLength(TOP_PESTS);
    expect(rest).toHaveLength(RAINSHADOW.length - TOP_PESTS);
  });

  it('copes with a library smaller than the cut', () => {
    const { top, rest } = splitForPicker(RAINSHADOW.slice(0, 3), {});
    expect(top).toHaveLength(3);
    expect(rest).toHaveLength(0);
  });
});
