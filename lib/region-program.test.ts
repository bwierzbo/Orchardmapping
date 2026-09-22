import { describe, it, expect } from 'vitest';
import { adjustTriggerForRegion } from './region-program';
import { triggerSchema, type ValidatedTrigger } from './trigger-schema';

const cm = (): ValidatedTrigger =>
  triggerSchema.parse({ type: 'degree_day', dd: 425, base: 50, cutoff: 88, from: 'jan1' });

describe('adjustTriggerForRegion', () => {
  it('leaves a northern region counting from January 1', () => {
    const r = adjustTriggerForRegion(cm(), 'codling_moth', { cmAccumulation: 'jan1' });
    expect(r.trigger).toEqual(cm());
    expect(r.note).toBeNull();
  });

  it('switches a southern region to a biofix, with the right trap', () => {
    // Michigan and New York are south of 46°N and use a biofix; counting
    // from Jan 1 there calls first hatch early by days to weeks.
    const r = adjustTriggerForRegion(cm(), 'codling_moth', { cmAccumulation: 'biofix' });
    expect(r.trigger).toMatchObject({ from: 'biofix', biofixTrap: 'cm_pheromone', dd: 425 });
    expect(r.note).toContain('first catch');
  });

  it('produces a trigger the resolver will accept', () => {
    const r = adjustTriggerForRegion(cm(), 'codling_moth', { cmAccumulation: 'biofix' });
    expect(triggerSchema.safeParse(r.trigger).success).toBe(true);
  });

  it('uses the leafroller trap for leafrollers', () => {
    const r = adjustTriggerForRegion(
      triggerSchema.parse({ type: 'degree_day', dd: 435, base: 41 }),
      'leafrollers',
      { cmAccumulation: 'biofix' }
    );
    expect(r.trigger).toMatchObject({ biofixTrap: 'leafroller_pheromone' });
  });

  it('keeps the step and says so when no trap can give a biofix', () => {
    // Silently dropping it would hide a step; silently leaving it on
    // Jan 1 would hide that it runs early. Neither is acceptable.
    const r = adjustTriggerForRegion(cm(), 'san_jose_scale', { cmAccumulation: 'biofix' });
    expect(r.trigger).toEqual(cm());
    expect(r.note).toContain('no trap is defined');
  });

  it('never touches a step that already counts from a biofix', () => {
    // Note the trap is required to build this at all — the schema refuses
    // a biofix model with nothing to take the biofix from.
    const already = triggerSchema.parse({
      type: 'degree_day',
      dd: 425,
      base: 50,
      from: 'biofix',
      biofixTrap: 'cm_pheromone',
    });
    const r = adjustTriggerForRegion(already, 'codling_moth', { cmAccumulation: 'biofix' });
    expect(r.trigger).toEqual(already);
    expect(r.note).toBeNull();
  });

  it('leaves every other kind of trigger alone', () => {
    for (const t of [
      { type: 'calendar', start: '10-01', end: '03-31' },
      { type: 'phenology', stage: 'petal_fall', windowDays: 60 },
      { type: 'threshold', trap: 'red_sphere', count: 1 },
    ]) {
      const parsed = triggerSchema.parse(t);
      const r = adjustTriggerForRegion(parsed, 'apple_maggot', { cmAccumulation: 'biofix' });
      expect(r.trigger).toEqual(parsed);
      expect(r.note).toBeNull();
    }
  });
});
