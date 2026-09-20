import { describe, it, expect } from 'vitest';
import { findCoverageGaps, type CoverageInputs } from './program-coverage';

const pest = (key: string, prevalence: string, category = 'insect') => ({
  key,
  name: key,
  category,
  prevalence,
});
const step = (key: string, pestKey: string | null, materialKey: string | null = null) => ({
  key,
  pestKey,
  materialKey,
});
const mat = (material_key: string, targets: string[]) => ({ material_key, targets });

/** The exact situation this module was written after missing. */
const THE_LEAFROLLER_CASE: CoverageInputs = {
  pests: [pest('leafrollers', 'high'), pest('codling_moth', 'high')],
  steps: [step('cm_gen1_425', 'codling_moth', 'cpgv')],
  materials: [mat('bt_kurstaki', ['leafrollers']), mat('cpgv', ['codling_moth'])],
};

describe('findCoverageGaps', () => {
  it('catches a high-prevalence pest with no step', () => {
    const gaps = findCoverageGaps(THE_LEAFROLLER_CASE);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pestKey).toBe('leafrollers');
  });

  it('flags that a material for it is sitting unused — the damning part', () => {
    const [gap] = findCoverageGaps(THE_LEAFROLLER_CASE);
    expect(gap.availableMaterials).toEqual(['bt_kurstaki']);
    expect(gap.hasUnusedMaterial).toBe(true);
  });

  it('is quiet once a step addresses it', () => {
    const gaps = findCoverageGaps({
      ...THE_LEAFROLLER_CASE,
      steps: [
        ...THE_LEAFROLLER_CASE.steps,
        step('leafroller_bt_spring', 'leafrollers', 'bt_kurstaki'),
      ],
    });
    expect(gaps).toEqual([]);
  });

  it('accepts the ORCHARD\'s own decision not to treat something', () => {
    const decided = findCoverageGaps({
      pests: [pest('fire_blight', 'high', 'disease')],
      steps: [],
      materials: [],
      decisions: [{ pestKey: 'fire_blight', posture: 'off', note: 'Absent west of the Cascades' }],
    });
    expect(decided).toEqual([]);
  });

  it('counts any posture as having been considered, not just off', () => {
    // Choosing to watch a pest is a decision too.
    const watching = findCoverageGaps({
      pests: [pest('apple_scab', 'high', 'disease')],
      steps: [],
      materials: [],
      decisions: [{ pestKey: 'apple_scab', posture: 'evidence' }],
    });
    expect(watching).toEqual([]);
  });

  it('still flags a pest nobody has decided anything about', () => {
    const undecided = findCoverageGaps({
      pests: [pest('something_new', 'high')],
      steps: [],
      materials: [],
      decisions: [{ pestKey: 'a_different_pest', posture: 'off' }],
    });
    expect(undecided).toHaveLength(1);
    expect(undecided[0].pestKey).toBe('something_new');
  });

  it('ignores beneficials and low-prevalence entries', () => {
    const gaps = findCoverageGaps({
      pests: [
        pest('european_earwig', 'beneficial', 'beneficial'),
        pest('quiet_thing', 'low'),
        pest('absent_thing', 'absent'),
      ],
      steps: [],
      materials: [],
    });
    expect(gaps).toEqual([]);
  });

  it('does not count a switched-off step as coverage', () => {
    // listProgramSteps already filters disabled steps out, so an empty
    // step list IS the disabled case — the gap must reappear.
    const gaps = findCoverageGaps({ ...THE_LEAFROLLER_CASE, steps: [] });
    expect(gaps.map((g) => g.pestKey).sort()).toEqual(['codling_moth', 'leafrollers']);
  });

  it('ranks a scheduling miss above a genuine limitation', () => {
    const gaps = findCoverageGaps({
      pests: [pest('nothing_treats_it', 'high'), pest('leafrollers', 'high')],
      steps: [],
      materials: [mat('bt_kurstaki', ['leafrollers'])],
    });
    // Both high, but one has a material going unused — that ranks first
    expect(gaps.map((g) => g.pestKey)).toEqual(['leafrollers', 'nothing_treats_it']);
  });

  it('ranks high prevalence above moderate', () => {
    const gaps = findCoverageGaps({
      pests: [pest('moderate_one', 'moderate'), pest('high_one', 'high')],
      steps: [],
      materials: [],
    });
    expect(gaps.map((g) => g.pestKey)).toEqual(['high_one', 'moderate_one']);
  });
});
