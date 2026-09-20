import { describe, it, expect } from 'vitest';
import {
  biofixDate,
  calendarWindow,
  resolveProgram,
  resolveStep,
  type ProgramStep,
  type ResolveInput,
  type Trigger,
} from './ipm-schedule';
import type { PhenologyMark } from './phenology';

const MARKS: PhenologyMark[] = [
  { stage: 'green_tip', observedOn: '2026-03-14' },
  { stage: 'half_inch_green', observedOn: '2026-03-28' },
  { stage: 'pink', observedOn: '2026-04-21' },
  { stage: 'petal_fall', observedOn: '2026-05-12' },
];

/** Degree-day totals for a season that has reached 425 but not 1400. */
const DD: Record<number, string> = { 375: '2026-04-02', 425: '2026-04-09' };
/** Totals accumulated from a biofix rather than Jan 1 — reached later. */
const BIOFIX_DD: Record<number, string> = { 435: '2026-07-20' };
const ddDate = (t: { dd: number }, biofix: string | null) =>
  (biofix ? BIOFIX_DD[t.dd] : DD[t.dd]) ?? null;

const step = (
  trigger: Trigger,
  key = 'k',
  extra: Partial<ProgramStep> = {}
): ProgramStep => ({
  key,
  title: key,
  detail: '',
  category: 'disease',
  pestKey: null,
  materialKey: null,
  trigger,
  repeatDays: null,
  sortOrder: 1,
  ...extra,
});

const input = (asOfYmd: string, steps: ProgramStep[] = []): ResolveInput => ({
  steps,
  season: 2026,
  asOfYmd,
  marks: MARKS,
  ddDate,
});

describe('calendarWindow', () => {
  it('places a within-year window in the season', () => {
    expect(calendarWindow({ type: 'calendar', start: '09-15', end: '10-15' }, 2026)).toEqual({
      start: '2026-09-15',
      end: '2026-10-15',
    });
  });

  it('wraps a window that crosses the new year', () => {
    // "Excise cankers November through February" is ONE window
    expect(calendarWindow({ type: 'calendar', start: '11-01', end: '02-28' }, 2026)).toEqual({
      start: '2026-11-01',
      end: '2027-02-28',
    });
  });
});

describe('calendar triggers', () => {
  const copper = step({ type: 'calendar', start: '09-15', end: '10-15' });

  it('is due inside the window', () => {
    const r = resolveStep(copper, input('2026-09-20'));
    expect(r.status).toBe('due');
    expect(r.daysUntil).toBe(-5);
  });

  it('is upcoming before it, with a countdown', () => {
    const r = resolveStep(copper, input('2026-09-01'));
    expect(r.status).toBe('upcoming');
    expect(r.daysUntil).toBe(14);
  });

  it('is past after it', () => {
    expect(resolveStep(copper, input('2026-10-16')).status).toBe('past');
  });

  it('is due on the closing day itself, not past', () => {
    expect(resolveStep(copper, input('2026-10-15')).status).toBe('due');
  });
});

describe('degree-day triggers', () => {
  it('opens on the date the threshold was crossed', () => {
    const r = resolveStep(step({ type: 'degree_day', dd: 425 }), input('2026-04-10'));
    expect(r.status).toBe('due');
    expect(r.start).toBe('2026-04-09');
    expect(r.end).toBe('2026-04-16'); // default 7-day window
    expect(r.why).toContain('425 DD');
  });

  it('waits when the heat has not accumulated', () => {
    const r = resolveStep(
      step({ type: 'degree_day', dd: 1400 }),
      input('2026-06-01')
    );
    expect(r.status).toBe('waiting');
    expect(r.start).toBeNull();
    expect(r.why).toContain('1400');
  });

  it('honours an explicit window', () => {
    const r = resolveStep(
      step({ type: 'degree_day', dd: 375, windowDays: 3 }),
      input('2026-04-03')
    );
    expect(r.end).toBe('2026-04-05');
  });
});

describe('phenology triggers', () => {
  it('opens at the marked stage', () => {
    const r = resolveStep(step({ type: 'phenology', stage: 'half_inch_green' }), input('2026-03-30'));
    expect(r.status).toBe('due');
    expect(r.start).toBe('2026-03-28');
  });

  it('runs between two marked stages', () => {
    const r = resolveStep(
      step({ type: 'phenology', stage: 'green_tip', untilStage: 'petal_fall' }),
      input('2026-04-15')
    );
    expect(r.start).toBe('2026-03-14');
    expect(r.end).toBe('2026-05-12');
    expect(r.status).toBe('due');
  });

  it('stays OPEN when the closing stage has not been marked yet', () => {
    // Primary scab runs green tip → petal fall. If petal fall is not
    // recorded, the window has not closed — it is still running. The
    // old behaviour here defaulted to a fortnight, which shut primary
    // scab about six weeks early.
    const r = resolveStep(
      step({ type: 'phenology', stage: 'pink', untilStage: 'full_bloom', windowDays: 10 }),
      input('2026-06-30')
    );
    expect(r.start).toBe('2026-04-21');
    expect(r.end).toBeNull();
    expect(r.status).toBe('due');
    expect(r.why).toContain('until full bloom is marked');
  });

  it('closes on the closing stage once it IS marked', () => {
    const r = resolveStep(
      step({ type: 'phenology', stage: 'green_tip', untilStage: 'petal_fall' }),
      input('2026-06-30')
    );
    expect(r.end).toBe('2026-05-12');
    expect(r.status).toBe('past');
  });

  it('uses windowDays only when no closing stage is given', () => {
    const r = resolveStep(
      step({ type: 'phenology', stage: 'pink', windowDays: 10 }),
      input('2026-04-25')
    );
    expect(r.end).toBe('2026-05-01');
  });

  it('applies a positive offset', () => {
    const r = resolveStep(
      step({ type: 'phenology', stage: 'green_tip', offsetDays: 7 }),
      input('2026-03-22')
    );
    expect(r.start).toBe('2026-03-21');
  });

  it('waits when the anchoring stage is unmarked', () => {
    const r = resolveStep(step({ type: 'phenology', stage: 'leaf_fall' }), input('2026-10-01'));
    expect(r.status).toBe('waiting');
    expect(r.why).toContain('leaf fall');
  });

  it('is unaffected by a mark from another season', () => {
    const r = resolveStep(step({ type: 'phenology', stage: 'green_tip' }), {
      ...input('2027-03-20'),
      season: 2027,
    });
    expect(r.status).toBe('waiting');
  });
});

describe('condition triggers', () => {
  const scab = step({
    type: 'condition',
    kind: 'scab_infection',
    fromStage: 'green_tip',
    untilStage: 'petal_fall',
  });

  it('is a live watch between its stages — never a scheduled date', () => {
    const r = resolveStep(scab, input('2026-04-15'));
    expect(r.status).toBe('monitor');
    expect(r.why).toBe('Watching conditions');
  });

  it('is upcoming before the opening stage', () => {
    expect(resolveStep(scab, input('2026-03-01')).status).toBe('upcoming');
  });

  it('closes after the ending stage', () => {
    expect(resolveStep(scab, input('2026-06-01')).status).toBe('past');
  });

  it('waits when the opening stage is unmarked', () => {
    const r = resolveStep(
      step({ type: 'condition', kind: 'scab_infection', fromStage: 'silver_tip' }),
      input('2026-04-01')
    );
    expect(r.status).toBe('waiting');
  });
});

describe('threshold triggers', () => {
  const kaolin = step({ type: 'threshold', trap: 'red_sphere', count: 1 }, 'kaolin', {
    materialKey: 'kaolin',
  });

  it('is a watch while the traps are empty', () => {
    const r = resolveStep(kaolin, input('2026-07-15'));
    expect(r.status).toBe('monitor');
    expect(r.start).toBeNull();
    expect(r.why).toContain('red sphere');
  });

  it('opens on the first qualifying catch, and says what was caught', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-07-15'),
      trapCatches: [{ trapType: 'red_sphere', countedOn: '2026-07-08', count: 2 }],
    });
    expect(r.status).toBe('due');
    expect(r.start).toBe('2026-07-08');
    expect(r.end).toBeNull();
    expect(r.why).toContain('2 caught per red sphere');
  });

  it('ignores a catch below the threshold', () => {
    const r = resolveStep(
      step({ type: 'threshold', trap: 'red_sphere', count: 5 }, 'k2'),
      {
        ...input('2026-07-15'),
        trapCatches: [{ trapType: 'red_sphere', countedOn: '2026-07-08', count: 2 }],
      }
    );
    expect(r.status).toBe('monitor');
  });

  it('ignores a catch in a different trap type', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-07-15'),
      trapCatches: [{ trapType: 'cm_pheromone', countedOn: '2026-07-08', count: 9 }],
    });
    expect(r.status).toBe('monitor');
  });

  it('ignores last season\'s flight', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-07-15'),
      trapCatches: [{ trapType: 'red_sphere', countedOn: '2025-07-08', count: 6 }],
    });
    expect(r.status).toBe('monitor');
  });

  it('anchors on the FIRST catch, not the biggest or the latest', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-08-01'),
      trapCatches: [
        { trapType: 'red_sphere', countedOn: '2026-07-22', count: 11 },
        { trapType: 'red_sphere', countedOn: '2026-07-08', count: 1 },
      ],
    });
    expect(r.start).toBe('2026-07-08');
  });

  it('cycles done and due again as the film needs renewing', () => {
    const maintained = step({ type: 'threshold', trap: 'red_sphere', count: 1 }, 'kaolin', {
      materialKey: 'kaolin',
      repeatDays: 10,
    });
    const catches = [{ trapType: 'red_sphere' as const, countedOn: '2026-07-08', count: 2 }];
    const sprayed = [{ materialKey: 'kaolin', appliedOn: '2026-07-09' }];

    const fresh = resolveStep(maintained, {
      ...input('2026-07-12'),
      trapCatches: catches,
      applications: sprayed,
    });
    expect(fresh.status).toBe('done');
    expect(fresh.dueAgainOn).toBe('2026-07-19');

    const worn = resolveStep(maintained, {
      ...input('2026-07-25'),
      trapCatches: catches,
      applications: sprayed,
    });
    expect(worn.status).toBe('due');
    expect(worn.lastDoneOn).toBe('2026-07-09');
  });
});

describe('resolveProgram ordering', () => {
  it('leads with what is open, then watches, then what is coming', () => {
    const steps = [
      step({ type: 'calendar', start: '01-01', end: '02-01' }, 'past-one'),
      step({ type: 'phenology', stage: 'leaf_fall' }, 'waiting-one'),
      step({ type: 'calendar', start: '06-01', end: '06-30' }, 'upcoming-one'),
      step({ type: 'threshold', trap: 'red_sphere', count: 1 }, 'watch-one'),
      step({ type: 'phenology', stage: 'half_inch_green', windowDays: 60 }, 'due-one'),
    ];
    const order = resolveProgram(input('2026-04-15', steps)).map((r) => r.step.key);
    expect(order).toEqual(['due-one', 'watch-one', 'upcoming-one', 'waiting-one', 'past-one']);
  });

  it('sorts several upcoming steps by how soon they open', () => {
    const steps = [
      step({ type: 'calendar', start: '09-01', end: '09-30' }, 'later'),
      step({ type: 'calendar', start: '06-01', end: '06-30' }, 'sooner'),
    ];
    const order = resolveProgram(input('2026-04-15', steps)).map((r) => r.step.key);
    expect(order).toEqual(['sooner', 'later']);
  });
});

describe('completion', () => {
  const window = { type: 'calendar', start: '09-15', end: '10-15' } as const;

  it('marks an open step done from an explicit completion', () => {
    const r = resolveStep(step(window, 'copper'), {
      ...input('2026-09-25'),
      completions: [{ stepKey: 'copper', completedOn: '2026-09-20' }],
    });
    expect(r.status).toBe('done');
    expect(r.lastDoneOn).toBe('2026-09-20');
    expect(r.dueAgainOn).toBeNull();
  });

  it('is untouched by a completion for a different step', () => {
    const r = resolveStep(step(window, 'copper'), {
      ...input('2026-09-25'),
      completions: [{ stepKey: 'something_else', completedOn: '2026-09-20' }],
    });
    expect(r.status).toBe('due');
    expect(r.lastDoneOn).toBeNull();
  });

  it('counts a recorded spray of the step material as doing the work', () => {
    const r = resolveStep(step(window, 'copper', { materialKey: 'copper' }), {
      ...input('2026-09-25'),
      applications: [{ materialKey: 'copper', appliedOn: '2026-09-18' }],
    });
    expect(r.status).toBe('done');
    expect(r.lastDoneOn).toBe('2026-09-18');
  });

  it('does NOT let one spray tick off another step using the same material', () => {
    // Copper appears twice in the program — autumn, and half-inch
    // green. The autumn application must not complete the spring step.
    const spring = step({ type: 'phenology', stage: 'half_inch_green', windowDays: 7 }, 'copper_spring', {
      materialKey: 'copper',
    });
    const r = resolveStep(spring, {
      ...input('2026-03-30'),
      applications: [{ materialKey: 'copper', appliedOn: '2025-09-18' }],
    });
    expect(r.status).toBe('due');
    expect(r.lastDoneOn).toBeNull();
  });

  it('ignores a spray of a different material', () => {
    const r = resolveStep(step(window, 'copper', { materialKey: 'copper' }), {
      ...input('2026-09-25'),
      applications: [{ materialKey: 'lime_sulfur', appliedOn: '2026-09-18' }],
    });
    expect(r.status).toBe('due');
  });

  it('brings a recurring step back when its interval is up', () => {
    const scouting = step({ type: 'calendar', start: '10-01', end: '03-31' }, 'scout', {
      repeatDays: 30,
    });
    const done = { completions: [{ stepKey: 'scout', completedOn: '2026-10-05' }] };

    const soon = resolveStep(scouting, { ...input('2026-10-20'), ...done });
    expect(soon.status).toBe('done');
    expect(soon.dueAgainOn).toBe('2026-11-04');

    const later = resolveStep(scouting, { ...input('2026-11-10'), ...done });
    expect(later.status).toBe('due');
    expect(later.lastDoneOn).toBe('2026-10-05');
  });

  it('uses the most recent of several completions', () => {
    const scouting = step({ type: 'calendar', start: '10-01', end: '03-31' }, 'scout', {
      repeatDays: 30,
    });
    const r = resolveStep(scouting, {
      ...input('2026-12-01'),
      completions: [
        { stepKey: 'scout', completedOn: '2026-10-05' },
        { stepKey: 'scout', completedOn: '2026-11-20' },
      ],
    });
    expect(r.lastDoneOn).toBe('2026-11-20');
    expect(r.status).toBe('done');
  });

  it('does not resurrect a step whose window has closed', () => {
    const r = resolveStep(step(window, 'copper'), {
      ...input('2026-11-01'),
      completions: [{ stepKey: 'copper', completedOn: '2026-09-20' }],
    });
    // Past stays past — but the history is still reported
    expect(r.status).toBe('past');
    expect(r.lastDoneOn).toBe('2026-09-20');
  });

  it('never marks a condition watch done', () => {
    const r = resolveStep(
      step({ type: 'condition', kind: 'scab_infection', fromStage: 'green_tip' }, 'scab'),
      { ...input('2026-04-15'), completions: [{ stepKey: 'scab', completedOn: '2026-04-10' }] }
    );
    expect(r.status).toBe('monitor');
  });

  it('drops done steps below what still needs doing', () => {
    const steps = [
      step({ type: 'calendar', start: '09-15', end: '10-15' }, 'done-one'),
      step({ type: 'calendar', start: '09-01', end: '10-31' }, 'due-one'),
    ];
    const order = resolveProgram({
      ...input('2026-09-25', steps),
      completions: [{ stepKey: 'done-one', completedOn: '2026-09-20' }],
    }).map((r) => r.step.key);
    expect(order).toEqual(['due-one', 'done-one']);
  });
});

describe('biofix degree-day triggers', () => {
  const lrSummer = step(
    {
      type: 'degree_day',
      dd: 435,
      base: 41,
      cutoff: 85,
      from: 'biofix',
      biofixTrap: 'leafroller_pheromone',
      windowDays: 10,
    },
    'lr_gen2'
  );
  const caught = [
    { trapType: 'leafroller_pheromone' as const, countedOn: '2026-05-20', count: 3 },
    { trapType: 'leafroller_pheromone' as const, countedOn: '2026-06-02', count: 11 },
  ];

  it('cannot be placed until a trap has caught something', () => {
    const r = resolveStep(lrSummer, input('2026-06-15'));
    expect(r.status).toBe('waiting');
    expect(r.why).toMatch(/first leafroller pheromone catch to set the biofix/);
  });

  it('places once the biofix exists, and names the model it used', () => {
    const r = resolveStep(lrSummer, { ...input('2026-07-25'), trapCatches: caught });
    expect(r.status).toBe('due');
    expect(r.start).toBe('2026-07-20');
    expect(r.why).toMatch(/base 41°F from biofix 2026-05-20/);
  });

  it('takes the FIRST catch as the biofix, not the biggest', () => {
    expect(biofixDate(caught, 'leafroller_pheromone', 2026)).toBe('2026-05-20');
    expect(biofixDate([...caught].reverse(), 'leafroller_pheromone', 2026)).toBe('2026-05-20');
  });

  it('ignores an empty trap reading — zero is not a first catch', () => {
    const zeroFirst = [
      { trapType: 'leafroller_pheromone' as const, countedOn: '2026-05-01', count: 0 },
      ...caught,
    ];
    expect(biofixDate(zeroFirst, 'leafroller_pheromone', 2026)).toBe('2026-05-20');
  });

  it('ignores last season and other trap types', () => {
    expect(biofixDate(caught, 'red_sphere', 2026)).toBeNull();
    expect(biofixDate(caught, 'leafroller_pheromone', 2027)).toBeNull();
  });

  it('says which model it is waiting on when the heat is short', () => {
    const r = resolveStep(
      step({ type: 'degree_day', dd: 9999, base: 41, cutoff: 85 }, 'far_off'),
      input('2026-06-01')
    );
    expect(r.status).toBe('waiting');
    expect(r.why).toMatch(/base 41°F from Jan 1/);
  });

  it('still defaults to the codling moth model when none is given', () => {
    const r = resolveStep(step({ type: 'degree_day', dd: 425 }, 'cm'), input('2026-04-10'));
    expect(r.status).toBe('due');
    expect(r.why).toMatch(/base 50°F from Jan 1/);
  });
});

describe('evidence from the future (regression)', () => {
  // Found by replaying a simulated season: asking about April showed a
  // step completed by a July spray, and a trap threshold tripped by a
  // catch three months ahead. The live app always asks about today, so
  // it never bit in use — but every retrospective view was wrong.
  const kaolin = step({ type: 'threshold', trap: 'red_sphere', count: 1 }, 'maggot', {
    materialKey: 'kaolin',
  });

  it('ignores a trap catch dated after the as-of date', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-04-15'),
      trapCatches: [{ trapType: 'red_sphere', countedOn: '2026-07-05', count: 3 }],
    });
    expect(r.status).toBe('monitor');
    expect(r.why).not.toMatch(/2026-07-05/);
  });

  it('ignores a completion dated after the as-of date', () => {
    const r = resolveStep(step({ type: 'calendar', start: '01-01', end: '12-31' }, 'x'), {
      ...input('2026-04-15'),
      completions: [{ stepKey: 'x', completedOn: '2026-07-16' }],
    });
    expect(r.status).toBe('due');
    expect(r.lastDoneOn).toBeNull();
  });

  it('ignores a spray dated after the as-of date', () => {
    const r = resolveStep(
      step({ type: 'calendar', start: '01-01', end: '12-31' }, 'x', { materialKey: 'copper' }),
      {
        ...input('2026-04-15'),
        applications: [{ materialKey: 'copper', appliedOn: '2026-07-16' }],
      }
    );
    expect(r.status).toBe('due');
    expect(r.lastDoneOn).toBeNull();
  });

  it('still counts evidence up to and including the as-of date', () => {
    const r = resolveStep(kaolin, {
      ...input('2026-07-05'),
      trapCatches: [{ trapType: 'red_sphere', countedOn: '2026-07-05', count: 3 }],
    });
    expect(r.status).toBe('due');
  });
});

describe('a threshold step goes quiet when the flight does (regression)', () => {
  const kaolin = step({ type: 'threshold', trap: 'red_sphere', count: 1 }, 'maggot', {
    materialKey: 'kaolin',
  });
  const julyCatch = [{ trapType: 'red_sphere' as const, countedOn: '2026-07-05', count: 3 }];

  it('stays open while the catch is recent', () => {
    expect(resolveStep(kaolin, { ...input('2026-07-20'), trapCatches: julyCatch }).status)
      .toBe('due');
  });

  it('returns to watching once the catches stop', () => {
    // One catch in July was still demanding a spray in late September,
    // long after the traps had gone back to zero.
    const r = resolveStep(kaolin, { ...input('2026-09-20'), trapCatches: julyCatch });
    expect(r.status).toBe('monitor');
    expect(r.why).toMatch(/Quiet since 2026-07-05/);
  });

  it('honours an explicit staleness window', () => {
    const impatient = step(
      { type: 'threshold', trap: 'red_sphere', count: 1, staleAfterDays: 7 },
      'k2'
    );
    expect(resolveStep(impatient, { ...input('2026-07-20'), trapCatches: julyCatch }).status)
      .toBe('monitor');
  });
});

describe('a closed kickback window does not end the watch (regression)', () => {
  // Marking the watch 'past' when one event's window closed stopped it
  // watching for the rest of the season, silently — so a scab watch
  // that missed its first event in March saw nothing in April or May.
  const watch = step(
    { type: 'condition', kind: 'scab_infection', fromStage: 'green_tip', untilStage: 'petal_fall' },
    'scab_watch',
    { pestKey: 'apple_scab', materialKey: 'lime_sulfur' }
  );
  const react = [{ pestKey: 'apple_scab', posture: 'react' as const, minSeverity: 'moderate' as const }];
  const kickbackHours = () => 48;

  it('is due inside the window', () => {
    const r = resolveStep(watch, {
      ...input('2026-04-12'),
      postures: react,
      kickbackHours,
      nowTs: '2026-04-12T08:00',
      infectionEvents: [
        { startTs: '2026-04-11T02:00', endTs: '2026-04-12T06:00', severity: 'moderate' },
      ],
    });
    expect(r.status).toBe('due');
    expect(r.why).toMatch(/left to act/);
  });

  it('goes back to WATCHING once that window closes, not to past', () => {
    const r = resolveStep(watch, {
      ...input('2026-04-20'),
      postures: react,
      kickbackHours,
      nowTs: '2026-04-20T08:00',
      infectionEvents: [
        { startTs: '2026-04-11T02:00', endTs: '2026-04-12T06:00', severity: 'moderate' },
      ],
    });
    expect(r.status).toBe('monitor');
    expect(r.why).toMatch(/Watching/);
  });

  it('picks up a later event after an earlier one was missed', () => {
    const r = resolveStep(watch, {
      ...input('2026-05-02'),
      postures: react,
      kickbackHours,
      nowTs: '2026-05-02T08:00',
      infectionEvents: [
        { startTs: '2026-03-16T02:00', endTs: '2026-03-18T06:00', severity: 'severe' },
        { startTs: '2026-05-01T20:00', endTs: '2026-05-02T10:00', severity: 'moderate' },
      ],
    });
    expect(r.status).toBe('due');
    expect(r.why).toMatch(/2026-05-01/);
  });

  it('only truly ends when the stage window closes', () => {
    const r = resolveStep(watch, { ...input('2026-06-20'), postures: react, kickbackHours });
    expect(r.status).toBe('past');
    expect(r.why).toMatch(/Outside the watch window/);
  });
});
