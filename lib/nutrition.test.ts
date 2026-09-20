import { describe, it, expect } from 'vitest';
import {
  LEAF_SUFFICIENCY,
  NUTRIENTS,
  assessLeafTest,
  assessNutrient,
  intentNotesFor,
  samplingGuidance,
} from './nutrition';

describe('sufficiency ranges', () => {
  it('covers every nutrient with a sane range and unit', () => {
    for (const n of NUTRIENTS) {
      const r = LEAF_SUFFICIENCY[n];
      expect(r.low).toBeLessThan(r.high);
      expect(['percent', 'ppm']).toContain(r.unit);
      expect(r.label.length).toBeGreaterThan(1);
    }
  });

  it('matches the WSU values for the ones most often acted on', () => {
    expect(LEAF_SUFFICIENCY.n).toMatchObject({ low: 1.7, high: 2.5, unit: 'percent' });
    expect(LEAF_SUFFICIENCY.ca).toMatchObject({ low: 1.5, high: 2.0, unit: 'percent' });
    expect(LEAF_SUFFICIENCY.b).toMatchObject({ low: 20, high: 60, unit: 'ppm' });
  });
});

describe('assessNutrient', () => {
  it('calls a reading below the range deficient', () => {
    const a = assessNutrient({ nutrient: 'n', value: 1.4 });
    expect(a.verdict).toBe('deficient');
    expect(a.distance).toBeCloseTo((1.7 - 1.4) / (2.5 - 1.7), 4);
  });

  it('calls a reading above the range excessive', () => {
    expect(assessNutrient({ nutrient: 'n', value: 3.0 }).verdict).toBe('excessive');
  });

  it('treats the boundaries as adequate, not as failures', () => {
    expect(assessNutrient({ nutrient: 'n', value: 1.7 }).verdict).toBe('adequate');
    expect(assessNutrient({ nutrient: 'n', value: 2.5 }).verdict).toBe('adequate');
  });

  it('distinguishes unmeasured from deficient', () => {
    // A lab that did not run boron is not a boron deficiency.
    const a = assessNutrient({ nutrient: 'b', value: null });
    expect(a.verdict).toBe('unmeasured');
    expect(a.distance).toBeNull();
  });
});

describe('assessLeafTest', () => {
  it('puts problems first, worst first, and unmeasured last', () => {
    const out = assessLeafTest([
      { nutrient: 'k', value: 1.5 },     // adequate
      { nutrient: 'b', value: null },    // unmeasured
      { nutrient: 'ca', value: 2.6 },    // excessive
      { nutrient: 'n', value: 0.9 },     // badly deficient
      { nutrient: 'mg', value: 0.2 },    // slightly deficient
    ]);
    expect(out.map((a) => a.nutrient)).toEqual(['n', 'mg', 'ca', 'k', 'b']);
  });
});

describe('what the orchard intent changes', () => {
  const lowN = assessLeafTest([{ nutrient: 'n', value: 1.2 }]);
  const lowCa = assessLeafTest([{ nutrient: 'ca', value: 1.1 }]);

  it('warns a cider maker that low nitrogen reaches the ferment', () => {
    const notes = intentNotesFor('cider', lowN);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toMatch(/yeast-assimilable nitrogen/);
    expect(notes[0].note).toMatch(/keeving/);
  });

  it('says nothing to a dessert grower about low nitrogen', () => {
    // For fresh fruit the nitrogen worry is the other direction
    expect(intentNotesFor('dessert', lowN)).toEqual([]);
    expect(intentNotesFor('dessert', assessLeafTest([{ nutrient: 'n', value: 3.1 }])))
      .toHaveLength(1);
  });

  it('ranks calcium differently for cider than for fresh fruit', () => {
    expect(intentNotesFor('cider', lowCa)[0].note).toMatch(/lower priority/);
    expect(intentNotesFor('dessert', lowCa)[0].note).toMatch(/priority nutrient/);
  });

  it('says nothing when a reading is fine', () => {
    const fine = assessLeafTest([{ nutrient: 'n', value: 2.0 }]);
    expect(intentNotesFor('cider', fine)).toEqual([]);
  });

  it('has nothing to add for a mixed orchard, rather than guessing', () => {
    expect(intentNotesFor('mixed', lowN)).toEqual([]);
  });
});

describe('samplingGuidance', () => {
  it('scales the sampling design, not the thresholds', () => {
    const home = samplingGuidance('home');
    const commercial = samplingGuidance('commercial');
    expect(home.composites).toMatch(/whole orchard/i);
    expect(commercial.composites).toMatch(/per management block/i);
    // The ranges themselves are untouched by scale
    expect(LEAF_SUFFICIENCY.n.low).toBe(1.7);
  });

  it('gives every scale a soil interval and a reason', () => {
    for (const s of ['home', 'small_business', 'commercial'] as const) {
      const g = samplingGuidance(s);
      expect(g.soilEvery).toMatch(/year/);
      expect(g.note.length).toBeGreaterThan(20);
    }
  });
});
