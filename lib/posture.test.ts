import { describe, it, expect } from 'vitest';
import {
  POSTURES,
  describeProblem,
  hoursRemaining,
  kickbackDeadline,
  postureProblem,
  type MaterialCapability,
} from './posture';

const LIME_SULFUR: MaterialCapability = {
  materialKey: 'lime_sulfur',
  postInfectionHours: 48,
};
const WETTABLE_SULFUR: MaterialCapability = {
  materialKey: 'wettable_sulfur',
  postInfectionHours: null,
};

describe('postureProblem', () => {
  it('allows a reactive posture on a material with kickback', () => {
    expect(postureProblem('react', LIME_SULFUR)).toBeNull();
  });

  it('REFUSES a reactive posture on a material without kickback', () => {
    // The PNW handbook is explicit that wettable sulfur has no
    // post-infection activity. Reacting with it is a spray that arrives
    // after it can do anything.
    const p = postureProblem('react', WETTABLE_SULFUR)!;
    expect(p.kind).toBe('no_kickback');
    expect(describeProblem(p)).toMatch(/no post-infection activity/);
    expect(describeProblem(p)).toMatch(/Protect ahead instead/);
  });

  it('allows protecting ahead with either material, given a forecast', () => {
    expect(postureProblem('protect', WETTABLE_SULFUR, { hasForecast: true })).toBeNull();
    expect(postureProblem('protect', LIME_SULFUR, { hasForecast: true })).toBeNull();
  });

  it('refuses to protect ahead with no forecast to act on', () => {
    const p = postureProblem('protect', LIME_SULFUR, { hasForecast: false })!;
    expect(p.kind).toBe('no_forecast');
  });

  it('needs a material for anything but evidence and off', () => {
    expect(postureProblem('protect', null)!.kind).toBe('no_material');
    expect(postureProblem('react', null)!.kind).toBe('no_material');
    // Watching traps and doing nothing both work without one
    expect(postureProblem('evidence', null)).toBeNull();
    expect(postureProblem('off', null)).toBeNull();
  });

  it('never objects to off — that is a decision, not a strategy', () => {
    for (const m of [LIME_SULFUR, WETTABLE_SULFUR, null]) {
      expect(postureProblem('off', m, { hasForecast: false })).toBeNull();
    }
  });

  it('covers every posture in the vocabulary', () => {
    for (const p of POSTURES) {
      // Should not throw, whatever the combination
      expect(() => postureProblem(p, LIME_SULFUR, { hasForecast: true })).not.toThrow();
    }
  });
});

describe('kickbackDeadline', () => {
  it('counts from when the wet period BEGAN, not when it ended', () => {
    // Infection starts when spores land on wet tissue. Counting from the
    // end of a 40-hour wet spell would grant nearly two days the
    // material does not have.
    expect(kickbackDeadline('2026-04-10T06:00', 48)).toBe('2026-04-12T06:00');
  });

  it('handles a window that crosses midnight and a month end', () => {
    expect(kickbackDeadline('2026-04-29T20:00', 96)).toBe('2026-05-03T20:00');
  });
});

describe('hoursRemaining', () => {
  it('is positive inside the window and negative once it closes', () => {
    const deadline = kickbackDeadline('2026-04-10T06:00', 48);
    expect(hoursRemaining(deadline, '2026-04-11T06:00')).toBeCloseTo(24, 6);
    expect(hoursRemaining(deadline, '2026-04-12T06:00')).toBeCloseTo(0, 6);
    expect(hoursRemaining(deadline, '2026-04-13T06:00')).toBeCloseTo(-24, 6);
  });
});
