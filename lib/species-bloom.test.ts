import { describe, it, expect } from 'vitest';
import {
  SPECIES_BLOOM_DOY,
  bloomDoyForSpecies,
  isBloomAnchored,
  NOT_BLOOM_ANCHORED,
} from './species-bloom';
import { REGIONAL_BLOOM_DOY, dayOfYear } from './harvest-target';

describe('SPECIES_BLOOM_DOY', () => {
  it('keeps apple on the bloom measured from the WSU pairs', () => {
    expect(SPECIES_BLOOM_DOY.apple).toBe(REGIONAL_BLOOM_DOY);
  });

  it('puts stone fruit in flower before pome fruit', () => {
    expect(SPECIES_BLOOM_DOY.cherry).toBeLessThan(SPECIES_BLOOM_DOY.pear);
    expect(SPECIES_BLOOM_DOY.plum).toBeLessThan(SPECIES_BLOOM_DOY.apple);
    expect(SPECIES_BLOOM_DOY.pear).toBeLessThan(SPECIES_BLOOM_DOY.apple);
  });

  it('puts cherry a month before apple, which is the whole point', () => {
    // Anchoring a cherry to the apple bloom would predict its picking a
    // month late — later than the fruit would still be on the tree.
    expect(SPECIES_BLOOM_DOY.apple - SPECIES_BLOOM_DOY.cherry).toBeGreaterThan(30);
  });

  it('places every species inside the growing season', () => {
    for (const [species, doy] of Object.entries(SPECIES_BLOOM_DOY)) {
      expect(doy, species).toBeGreaterThan(dayOfYear(3, 1));
      expect(doy, species).toBeLessThan(dayOfYear(6, 15));
    }
  });
});

describe('bloomDoyForSpecies', () => {
  it('finds a species however it is cased or padded', () => {
    expect(bloomDoyForSpecies('Cherry')).toBe(SPECIES_BLOOM_DOY.cherry);
    expect(bloomDoyForSpecies('  PLUM  ')).toBe(SPECIES_BLOOM_DOY.plum);
  });

  it('falls back to apple for an unrecorded or unknown species', () => {
    for (const value of [null, undefined, '', '   ', 'dragonfruit']) {
      expect(bloomDoyForSpecies(value)).toBe(SPECIES_BLOOM_DOY.apple);
    }
  });
});

describe('isBloomAnchored', () => {
  it('excludes nuts, which flower in midwinter', () => {
    for (const nut of NOT_BLOOM_ANCHORED) expect(isBloomAnchored(nut)).toBe(false);
    expect(isBloomAnchored('hazelnut')).toBe(false);
  });

  it('includes every fruit it has a bloom for', () => {
    for (const species of Object.keys(SPECIES_BLOOM_DOY)) {
      expect(isBloomAnchored(species), species).toBe(true);
    }
  });

  it('treats an unknown species as bloom-anchored', () => {
    expect(isBloomAnchored('quandong')).toBe(true);
  });
});
