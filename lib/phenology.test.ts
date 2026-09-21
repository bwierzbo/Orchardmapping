import { describe, it, expect } from 'vitest';
import {
  PHENOLOGY_STAGES,
  currentStage,
  daysBetween,
  isPhenologyStage,
  remainingStages,
  seasonOf,
  stageDate,
  stageOrder,
  stageSpread,
  stageDateLatest,
  onePassWindow,
  type PhenologyMark,
} from './phenology';

const mark = (stage: string, observedOn: string) =>
  ({ stage, observedOn }) as PhenologyMark;

/** A realistic west-side spring, marked as it happened. */
const SPRING_2026: PhenologyMark[] = [
  mark('green_tip', '2026-03-14'),
  mark('half_inch_green', '2026-03-28'),
  mark('tight_cluster', '2026-04-09'),
  mark('pink', '2026-04-21'),
];

describe('stage vocabulary', () => {
  it('runs dormant → leaf fall in season order', () => {
    expect(PHENOLOGY_STAGES[0]).toBe('dormant');
    expect(PHENOLOGY_STAGES[PHENOLOGY_STAGES.length - 1]).toBe('leaf_fall');
    expect(stageOrder('green_tip')).toBeLessThan(stageOrder('pink'));
    expect(stageOrder('petal_fall')).toBeLessThan(stageOrder('harvest'));
  });

  it('recognises only real stages', () => {
    expect(isPhenologyStage('half_inch_green')).toBe(true);
    expect(isPhenologyStage('halfinchgreen')).toBe(false);
    expect(isPhenologyStage('')).toBe(false);
  });
});

describe('currentStage', () => {
  it('returns the latest mark on or before the date', () => {
    expect(currentStage(SPRING_2026, '2026-04-15')?.stage).toBe('tight_cluster');
    expect(currentStage(SPRING_2026, '2026-04-21')?.stage).toBe('pink');
  });

  it('ignores marks in the future', () => {
    expect(currentStage(SPRING_2026, '2026-03-20')?.stage).toBe('green_tip');
  });

  it('is null before the first mark of the season', () => {
    expect(currentStage(SPRING_2026, '2026-02-01')).toBeNull();
  });

  it('does not carry last season forward', () => {
    const marks = [...SPRING_2026, mark('harvest', '2025-09-30')];
    // January 2026 has no marks yet — 2025's harvest must not stand in
    expect(currentStage(marks, '2026-01-15')).toBeNull();
    expect(currentStage(marks, '2025-10-05')?.stage).toBe('harvest');
  });

  it('breaks a same-day tie on stage order, not insertion order', () => {
    const sameDay = [mark('full_bloom', '2026-05-02'), mark('first_bloom', '2026-05-02')];
    expect(currentStage(sameDay, '2026-05-02')?.stage).toBe('full_bloom');
    expect(currentStage([...sameDay].reverse(), '2026-05-02')?.stage).toBe('full_bloom');
  });

  it('handles an empty history', () => {
    expect(currentStage([], '2026-04-01')).toBeNull();
  });
});

describe('remainingStages', () => {
  it('offers only stages after the current one', () => {
    const next = remainingStages(SPRING_2026, '2026-04-25');
    expect(next[0]).toBe('first_bloom');
    expect(next).not.toContain('green_tip');
    expect(next).not.toContain('pink');
  });

  it('offers the whole season before anything is marked', () => {
    expect(remainingStages([], '2026-01-02')).toEqual([...PHENOLOGY_STAGES]);
  });

  it('skips a stage that was recorded out of order', () => {
    // Bloom marked, but tight cluster never was — it is behind us now
    const marks = [mark('green_tip', '2026-03-14'), mark('full_bloom', '2026-05-01')];
    const next = remainingStages(marks, '2026-05-03');
    expect(next).not.toContain('tight_cluster');
    expect(next[0]).toBe('petal_fall');
  });

  it('empties once leaf fall is marked', () => {
    const marks = [...SPRING_2026, mark('leaf_fall', '2026-11-10')];
    expect(remainingStages(marks, '2026-11-20')).toEqual([]);
  });
});

describe('stageDate', () => {
  it('finds the date for a season', () => {
    expect(stageDate(SPRING_2026, 'half_inch_green', 2026)).toBe('2026-03-28');
  });

  it('is null for an unrecorded stage or a different season', () => {
    expect(stageDate(SPRING_2026, 'harvest', 2026)).toBeNull();
    expect(stageDate(SPRING_2026, 'pink', 2025)).toBeNull();
  });
});

describe('seasonOf / daysBetween', () => {
  it('keys a season by calendar year', () => {
    expect(seasonOf('2026-11-10')).toBe(2026);
    expect(seasonOf('2026-01-02')).toBe(2026);
  });

  it('counts whole days without a timezone shift', () => {
    expect(daysBetween('2026-03-14', '2026-03-28')).toBe(14);
    expect(daysBetween('2026-03-28', '2026-03-14')).toBe(-14);
    // across a DST boundary — March 8 2026 is the US spring-forward
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('stageSpread', () => {
  const marks: PhenologyMark[] = [
    { stage: 'green_tip', observedOn: '2026-03-14', scope: 'variety', scopeValue: 'Dabinett' },
    { stage: 'green_tip', observedOn: '2026-03-19', scope: 'variety', scopeValue: 'Harrison' },
    { stage: 'green_tip', observedOn: '2026-03-16', scope: 'variety', scopeValue: 'Kingston Black' },
  ];

  it('reports the first and last group and the gap between them', () => {
    const s = stageSpread(marks, 'green_tip', 2026)!;
    expect(s.earliest).toBe('2026-03-14');
    expect(s.latest).toBe('2026-03-19');
    expect(s.spreadDays).toBe(5);
    expect(s.order.map((o) => o.group)).toEqual(['Dabinett', 'Kingston Black', 'Harrison']);
  });

  it('is null for a stage nothing has reached', () => {
    expect(stageSpread(marks, 'petal_fall', 2026)).toBeNull();
  });
});

describe('stageDate takes the EARLIEST group', () => {
  const marks: PhenologyMark[] = [
    { stage: 'half_inch_green', observedOn: '2026-04-02', scopeValue: 'Harrison' },
    { stage: 'half_inch_green', observedOn: '2026-03-28', scopeValue: 'Kingston Black' },
  ];

  it('anchors a protectant on the first variety to become vulnerable', () => {
    // Spraying the 28th protects both; spraying the 2nd leaves Kingston
    // Black exposed for five days, which is the point of the spray.
    expect(stageDate(marks, 'half_inch_green', 2026)).toBe('2026-03-28');
  });

  it('closes a window on the last', () => {
    expect(stageDateLatest(marks, 'half_inch_green', 2026)).toBe('2026-04-02');
  });
});

describe('onePassWindow', () => {
  it('finds the days that work for every variety', () => {
    const w = onePassWindow([
      { group: 'Kingston Black', start: '2026-03-28', end: '2026-04-04' },
      { group: 'Harrison', start: '2026-04-02', end: '2026-04-09' },
    ]);
    expect(w.start).toBe('2026-04-02');
    expect(w.end).toBe('2026-04-04');
    expect(w.needsTwoPasses).toBe(false);
  });

  it('says plainly when one pass cannot cover everything', () => {
    const w = onePassWindow([
      { group: 'Dabinett', start: '2026-03-28', end: '2026-04-04' },
      { group: 'Chisel Jersey', start: '2026-04-11', end: '2026-04-18' },
    ]);
    expect(w.needsTwoPasses).toBe(true);
  });

  it('stays open-ended when any group is', () => {
    // Primary scab with petal fall unmarked on one variety
    const w = onePassWindow([
      { group: 'A', start: '2026-03-14', end: '2026-05-12' },
      { group: 'B', start: '2026-03-19', end: null },
    ]);
    expect(w.start).toBe('2026-03-19');
    expect(w.end).toBeNull();
    expect(w.needsTwoPasses).toBe(false);
  });

  it('carries the groups it could not place rather than ignoring them', () => {
    const w = onePassWindow(
      [{ group: 'A', start: '2026-03-14', end: '2026-03-21' }],
      ['Nehou', 'Michelin']
    );
    expect(w.unplaced).toEqual(['Nehou', 'Michelin']);
  });

  it('handles a single group and none at all', () => {
    const one = onePassWindow([{ group: 'A', start: '2026-03-14', end: '2026-03-21' }]);
    expect(one.start).toBe('2026-03-14');
    expect(one.end).toBe('2026-03-21');
    expect(onePassWindow([]).start).toBeNull();
  });
});
