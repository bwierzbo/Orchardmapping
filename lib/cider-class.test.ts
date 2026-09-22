import { describe, it, expect } from 'vitest';
import { classify, describeDivergence } from './cider-class';

describe('classify', () => {
  it('places each of the four Long Ashton quadrants', () => {
    expect(classify({ tanninPct: 0.30, acidPct: 0.60 }).ciderClass).toBe('BSH');
    expect(classify({ tanninPct: 0.30, acidPct: 0.30 }).ciderClass).toBe('BSW');
    expect(classify({ tanninPct: 0.10, acidPct: 0.60 }).ciderClass).toBe('SH');
    expect(classify({ tanninPct: 0.10, acidPct: 0.30 }).ciderClass).toBe('SW');
  });

  it('classifies Harrison from WSU figures as a sharp', () => {
    // WSU Cultivar Performance Database, 2002-2017 means
    const r = classify({ tanninPct: 0.10, acidPct: 0.64 });
    expect(r.ciderClass).toBe('SH');
    expect(r.tanninBorderline).toBe(false);
  });

  it('classifies WSU Kingston Black as a sharp, clear of the line', () => {
    // 0.15% is a quarter below the 0.2% threshold — a real gap, not
    // analytical noise. The doubt about Kingston Black is not that this
    // number is marginal; it is that it was measured at WSU's trial
    // ground rather than in the rain shadow. That belongs to the scope,
    // not to the margin.
    const r = classify({ tanninPct: 0.15, acidPct: 0.61 });
    expect(r.ciderClass).toBe('SH');
    expect(r.tanninBorderline).toBe(false);
  });

  it('flags a value genuinely near the line as borderline', () => {
    // English Kingston Black runs about 0.19-0.25%, straddling it.
    const r = classify({ tanninPct: 0.19, acidPct: 0.61 });
    expect(r.ciderClass).toBe('SH');
    expect(r.tanninBorderline).toBe(true);
    expect(r.reason).toContain('sits on the line');
  });

  it('treats a value exactly on a threshold as not-over, and borderline', () => {
    const r = classify({ tanninPct: 0.2, acidPct: 0.45 });
    expect(r.ciderClass).toBe('SW');
    expect(r.tanninBorderline).toBe(true);
    expect(r.acidBorderline).toBe(true);
  });

  it('refuses to guess from half a measurement', () => {
    expect(classify({ acidPct: 0.6 }).ciderClass).toBeNull();
    expect(classify({ tanninPct: 0.3 }).ciderClass).toBeNull();
    expect(classify({}).ciderClass).toBeNull();
    expect(classify({ acidPct: 0.6 }).reason).toContain('bitter axis is unknown');
  });

  it('explains itself with the numbers it used', () => {
    expect(classify({ tanninPct: 0.3, acidPct: 0.6 }).reason).toContain('tannin 0.3% (over 0.2%)');
  });
});

describe('describeDivergence', () => {
  it('says nothing when the measurement agrees with the reference', () => {
    const obs = classify({ tanninPct: 0.30, acidPct: 0.60 });
    expect(describeDivergence('BSH', obs, 'in Washington')).toBeNull();
  });

  it('hedges when the measurement is borderline', () => {
    const obs = classify({ tanninPct: 0.19, acidPct: 0.61 });
    expect(describeDivergence('BSH', obs, 'in WSU trials')).toBe(
      'Known as a bittersharp, but reads closer to a sharp in WSU trials.'
    );
  });

  it('names the scope, so whose fruit it was stays visible', () => {
    const obs = classify({ tanninPct: 0.15, acidPct: 0.61 });
    expect(describeDivergence('BSH', obs, 'in WSU trials, 2002-2017')).toBe(
      'Known as a bittersharp, but presents as a sharp in WSU trials, 2002-2017.'
    );
  });

  it('states it plainly when the measurement is clear of the line', () => {
    const obs = classify({ tanninPct: 0.05, acidPct: 0.70 });
    expect(describeDivergence('BSH', obs, 'here')).toBe(
      'Known as a bittersharp, but presents as a sharp here.'
    );
  });

  it('says nothing without a reference or without a measurement', () => {
    expect(describeDivergence(null, classify({ tanninPct: 0.3, acidPct: 0.6 }), 'here')).toBeNull();
    expect(describeDivergence('BSH', classify({}), 'here')).toBeNull();
  });
});
