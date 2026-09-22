import { describe, it, expect } from 'vitest';
import { triggerSchema, describeTrigger } from './trigger-schema';

const ok = (v: unknown) => triggerSchema.safeParse(v).success;
const why = (v: unknown) => {
  const r = triggerSchema.safeParse(v);
  return r.success ? null : r.error.issues[0].message;
};

describe('triggerSchema', () => {
  it('accepts the five shapes the resolver can date', () => {
    expect(ok({ type: 'calendar', start: '10-01', end: '03-31' })).toBe(true);
    expect(ok({ type: 'phenology', stage: 'petal_fall', windowDays: 60 })).toBe(true);
    expect(ok({ type: 'degree_day', dd: 425, base: 50, cutoff: 88, from: 'jan1' })).toBe(true);
    expect(ok({ type: 'threshold', trap: 'red_sphere', count: 1 })).toBe(true);
    expect(ok({ type: 'condition', kind: 'scab_infection', fromStage: 'green_tip' })).toBe(true);
  });

  it('rejects a trigger kind the resolver has never heard of', () => {
    expect(ok({ type: 'when_i_feel_like_it' })).toBe(false);
  });

  it('insists on MM-DD, because a calendar window is not a date', () => {
    expect(ok({ type: 'calendar', start: '2026-10-01', end: '03-31' })).toBe(false);
    expect(why({ type: 'calendar', start: '13-01', end: '03-31' })).toContain('MM-DD');
  });

  it('rejects a growth stage that is not on the ladder', () => {
    expect(ok({ type: 'phenology', stage: 'nearly_ripe' })).toBe(false);
  });

  it('refuses a biofix model with no trap to take the biofix from', () => {
    // It would never fire, and would sit on the program looking like a plan.
    expect(why({ type: 'degree_day', dd: 435, from: 'biofix' })).toContain('needs the trap');
    expect(
      ok({ type: 'degree_day', dd: 435, from: 'biofix', biofixTrap: 'leafroller_pheromone' })
    ).toBe(true);
  });

  it('refuses a phenology window that ends two different ways', () => {
    expect(
      why({ type: 'phenology', stage: 'petal_fall', untilStage: 'leaf_fall', windowDays: 60 })
    ).toContain('not both');
  });

  it('rejects counts and degree-days outside anything plausible', () => {
    expect(ok({ type: 'threshold', trap: 'red_sphere', count: 0 })).toBe(false);
    expect(ok({ type: 'degree_day', dd: -5 })).toBe(false);
  });
});

describe('describeTrigger', () => {
  it('says what each kind means in a sentence', () => {
    expect(describeTrigger({ type: 'calendar', start: '10-01', end: '03-31' })).toBe(
      '10-01 to 03-31'
    );
    expect(
      describeTrigger({ type: 'degree_day', dd: 425, base: 50, from: 'jan1' })
    ).toBe('425 degree-days (base 50) from January 1');
    expect(
      describeTrigger({
        type: 'degree_day',
        dd: 435,
        from: 'biofix',
        biofixTrap: 'leafroller_pheromone',
      })
    ).toContain('first catch on leafroller_pheromone');
    expect(describeTrigger({ type: 'threshold', trap: 'red_sphere', count: 1 })).toBe(
      '1 or more on red sphere'
    );
    expect(
      describeTrigger({ type: 'phenology', stage: 'petal_fall', windowDays: 60 })
    ).toBe('petal fall for 60 days');
  });
});
