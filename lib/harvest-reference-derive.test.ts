import { describe, it, expect } from 'vitest';
import { deriveReference } from './harvest-reference-derive';
import { HARVEST_REFERENCE } from './data/harvest-reference';
import { SPECIES_BLOOM_DOY } from './species-bloom';
import { dayOfYear } from './harvest-target';

const ref = (variety: string) => {
  const found = HARVEST_REFERENCE.find((r) => r.variety === variety);
  if (!found) throw new Error(`no reference row for ${variety}`);
  return deriveReference(found);
};

describe('deriveReference', () => {
  it('counts from the species bloom, not the apple one', () => {
    // Rainier is picked in early July. Counted from the apple bloom it
    // would come out near 60 days; from the cherry bloom, near 95.
    const rainier = ref('Rainier');
    const centre = Math.round((dayOfYear(7, 1) + dayOfYear(7, 15)) / 2);
    expect(rainier.daysFromBloom).toBe(centre - SPECIES_BLOOM_DOY.cherry);
    expect(rainier.daysFromBloom).toBeGreaterThan(80);
  });

  it('puts an apple on the apple anchor', () => {
    const gem = ref("Hudson's Golden Gem");
    const centre = Math.round((dayOfYear(9, 25) + dayOfYear(10, 15)) / 2);
    expect(gem.daysFromBloom).toBe(centre - SPECIES_BLOOM_DOY.apple);
  });

  it('measures how long picking runs', () => {
    // Chandler picks over six weeks; Duke over about three.
    expect(ref('Chandler').windowHalfDays).toBeGreaterThan(ref('Duke').windowHalfDays);
  });

  it('writes the window the way a grower would say it', () => {
    expect(ref('Comice').prose).toContain('25 Sep – 10 Oct');
  });

  it('says when the season runs out instead of naming a date', () => {
    const pinkLady = ref('Pink Lady');
    expect(pinkLady.ripensHere).toBe(false);
    expect(pinkLady.detail).toContain('Does not reach maturity');
    const pomegranate = ref('Pomegranate');
    expect(pomegranate.ripensHere).toBe(false);
  });

  it('carries the confidence into words', () => {
    expect(ref('Rainier').detail).toContain('Well documented');
    expect(ref('Finn').detail).toContain('Little published record');
  });
});

describe('HARVEST_REFERENCE as a whole', () => {
  it('has no duplicate varieties', () => {
    const names = HARVEST_REFERENCE.map((r) => r.variety.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('never ends a window before it starts', () => {
    for (const r of HARVEST_REFERENCE) {
      expect(dayOfYear(...r.end), r.variety).toBeGreaterThan(dayOfYear(...r.start));
    }
  });

  it('derives an interval the database will accept', () => {
    // The column is CHECKed to 30..260 days (migration 068): anything
    // outside is a mistake in the table or the wrong bloom anchor. The
    // floor is 30 and not 60 because soft fruit runs bloom to ripe in
    // about eight weeks — Tulameen is 59 days and correct.
    for (const r of HARVEST_REFERENCE) {
      const d = deriveReference(r);
      expect(d.daysFromBloom, `${r.variety} (${r.species})`).toBeGreaterThanOrEqual(30);
      expect(d.daysFromBloom, `${r.variety} (${r.species})`).toBeLessThanOrEqual(260);
    }
  });

  it('keeps every window inside the picking season', () => {
    for (const r of HARVEST_REFERENCE) {
      expect(r.start[0], r.variety).toBeGreaterThanOrEqual(6);
      expect(r.end[0], r.variety).toBeLessThanOrEqual(11);
    }
  });

  it('gives a note to every row it is least sure of', () => {
    // A "poor" row without a note is a guess with nothing to warn the
    // reader, which is the one combination that must not ship.
    for (const r of HARVEST_REFERENCE.filter((x) => x.confidence === 'poor')) {
      expect(r.note, r.variety).toBeTruthy();
    }
  });

  it('explains every variety it says will not ripen', () => {
    for (const r of HARVEST_REFERENCE.filter((x) => x.ripensHere === false)) {
      expect(r.note, r.variety).toBeTruthy();
      expect(r.confidence, r.variety).not.toBe('poor');
    }
  });
});
