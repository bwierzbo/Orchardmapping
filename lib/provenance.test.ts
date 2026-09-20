import { describe, it, expect } from 'vitest';
import { CODE_PROVENANCE, CONFIDENCE, type Provenance } from './provenance';

/**
 * These test the DISCIPLINE, not the numbers. A record that claims to
 * be quoted without a sentence is worse than one honestly marked
 * assumed — it looks authoritative and cannot be checked.
 */
describe('provenance records', () => {
  it('uses only the three confidence levels', () => {
    for (const p of CODE_PROVENANCE) {
      expect(CONFIDENCE).toContain(p.confidence);
    }
  });

  it('gives every quoted value the sentence it came from', () => {
    const quotedWithoutQuote = CODE_PROVENANCE.filter(
      (p) => p.confidence === 'quoted' && !p.quote
    );
    expect(quotedWithoutQuote.map((p) => p.subject)).toEqual([]);
  });

  it('gives every quoted value a date it was checked', () => {
    const unchecked = CODE_PROVENANCE.filter((p) => p.confidence === 'quoted' && !p.verifiedOn);
    expect(unchecked.map((p) => p.subject)).toEqual([]);
  });

  it('makes every assumption explain itself', () => {
    // An unsourced number with no note is just an unsourced number.
    const bare = CODE_PROVENANCE.filter((p) => p.confidence === 'assumed' && !p.note);
    expect(bare.map((p) => p.subject)).toEqual([]);
  });

  it('never claims a source for something assumed', () => {
    for (const p of CODE_PROVENANCE.filter((x) => x.confidence === 'assumed')) {
      expect(p.source.toLowerCase()).toMatch(/unverified|ours|unsourced|NOT/i);
    }
  });

  it('has no duplicate subjects', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of CODE_PROVENANCE) {
      if (seen.has(p.subject)) dupes.push(p.subject);
      seen.add(p.subject);
    }
    expect(dupes).toEqual([]);
  });

  it('covers the values that were actually wrong in the audit', () => {
    // Every number that turned out to be wrong now has a record, so the
    // same mistake is visible rather than buried.
    const subjects = CODE_PROVENANCE.map((p: Provenance) => p.subject).join(' ');
    expect(subjects).toMatch(/MILLS\.minimum/);
    expect(subjects).toMatch(/LEAFROLLER_MODEL/);
  });
});
