import { z } from 'zod';
import { PHENOLOGY_STAGES } from './phenology';

/**
 * What a step may be triggered by, as a schema.
 *
 * The resolver (lib/ipm-schedule.ts) has always had these shapes as
 * TypeScript types, which say nothing at runtime — fine while every
 * trigger came from a seed migration written by hand. Once a grower can
 * invent a step, a trigger the resolver cannot read would place nothing
 * on the calendar and explain nothing about why.
 *
 * So the same five shapes, enforced. Anything that validates here is
 * something the resolver can date.
 */

const stage = z.enum(PHENOLOGY_STAGES as unknown as [string, ...string[]]);
const mmdd = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use MM-DD, e.g. 10-01');

/** A window of the calendar year. Latitude-bound, so usually a region's choice. */
export const calendarTrigger = z.object({
  type: z.literal('calendar'),
  start: mmdd,
  end: mmdd,
});

/**
 * Anchored to a growth stage the orchard was observed to reach. The most
 * portable kind: a stage happens when it happens, wherever you are.
 */
export const phenologyTrigger = z.object({
  type: z.literal('phenology'),
  stage,
  offsetDays: z.number().int().min(-60).max(365).optional(),
  untilStage: stage.optional(),
  windowDays: z.number().int().min(1).max(365).optional(),
});

/** Heat accumulation. `from` decides whether a biofix is required. */
export const degreeDayTrigger = z.object({
  type: z.literal('degree_day'),
  dd: z.number().min(0).max(10000),
  base: z.number().min(0).max(100).optional(),
  cutoff: z.number().min(0).max(150).optional(),
  from: z.enum(['jan1', 'biofix']).optional(),
  biofixTrap: z.string().min(1).optional(),
  windowDays: z.number().int().min(1).max(365).optional(),
});

/** Act on catches. `count: 1` means act on the first one. */
export const thresholdTrigger = z.object({
  type: z.literal('threshold'),
  trap: z.string().min(1),
  count: z.number().int().min(1).max(1000),
  staleAfterDays: z.number().int().min(1).max(365).optional(),
});

/** A standing watch on weather, not a scheduled date. */
export const conditionTrigger = z.object({
  type: z.literal('condition'),
  kind: z.enum(['scab_infection', 'dry_spell']),
  fromStage: stage.optional(),
  untilStage: stage.optional(),
});

export const triggerSchema = z
  .discriminatedUnion('type', [
    calendarTrigger,
    phenologyTrigger,
    degreeDayTrigger,
    thresholdTrigger,
    conditionTrigger,
  ])
  .superRefine((t, ctx) => {
    // A biofix model with no trap to take the biofix from can never fire,
    // and would sit on the program looking like a plan.
    if (t.type === 'degree_day' && t.from === 'biofix' && !t.biofixTrap) {
      ctx.addIssue({
        code: 'custom',
        message: 'A biofix model needs the trap whose first catch starts the count.',
        path: ['biofixTrap'],
      });
    }
    if (t.type === 'phenology' && t.untilStage && t.windowDays) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give either an end stage or a window in days, not both.',
        path: ['untilStage'],
      });
    }
  });

export type ValidatedTrigger = z.infer<typeof triggerSchema>;

/** Plain-language summary of a trigger, for lists and confirmations. */
export function describeTrigger(t: ValidatedTrigger): string {
  switch (t.type) {
    case 'calendar':
      return `${t.start} to ${t.end}`;
    case 'phenology':
      return [
        t.stage.replace(/_/g, ' '),
        t.offsetDays ? `+${t.offsetDays} days` : null,
        t.untilStage ? `until ${t.untilStage.replace(/_/g, ' ')}` : null,
        t.windowDays ? `for ${t.windowDays} days` : null,
      ]
        .filter(Boolean)
        .join(' ');
    case 'degree_day':
      return `${t.dd} degree-days (base ${t.base ?? 50}) from ${
        t.from === 'biofix' ? `first catch on ${t.biofixTrap}` : 'January 1'
      }`;
    case 'threshold':
      return `${t.count} or more on ${t.trap.replace(/_/g, ' ')}`;
    case 'condition':
      return t.kind === 'scab_infection' ? 'a scab infection period' : 'a dry spell';
  }
}
