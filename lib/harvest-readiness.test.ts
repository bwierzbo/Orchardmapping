import { describe, it, expect } from 'vitest';
import {
  READINESS_VERDICTS,
  READINESS_LABEL,
  READINESS_DAYS,
  readinessDelta,
  describePrediction,
} from './harvest-readiness';

describe('the verdicts', () => {
  it('runs from now to furthest out', () => {
    expect(READINESS_VERDICTS).toEqual(['now', 'week', 'two_weeks', 'not_yet']);
    const days = READINESS_VERDICTS.map((v) => READINESS_DAYS[v]);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it('labels every verdict', () => {
    for (const v of READINESS_VERDICTS) expect(READINESS_LABEL[v]).toBeTruthy();
  });
});

describe('readinessDelta', () => {
  it('is zero when the verdict lands on the predicted day', () => {
    // Predicted 8 Oct; on 1 Oct someone says "about a week". Agreed.
    expect(
      readinessDelta({ verdict: 'week', predictedCentre: '2026-10-08', observedOn: '2026-10-01' })
    ).toBe(0);
  });

  it('is positive when the tree is readier than predicted', () => {
    // Predicted 15 Oct, but on 1 Oct it is ready now: model is 14 days late.
    expect(
      readinessDelta({ verdict: 'now', predictedCentre: '2026-10-15', observedOn: '2026-10-01' })
    ).toBe(14);
  });

  it('is negative when the tree is behind the prediction', () => {
    // Predicted 1 Oct; on 1 Oct it wants another fortnight.
    expect(
      readinessDelta({ verdict: 'two_weeks', predictedCentre: '2026-10-01', observedOn: '2026-10-01' })
    ).toBe(-14);
  });

  it('says nothing when there was no prediction to compare with', () => {
    // An unanchored verdict is still worth recording; it just cannot
    // judge a model that made no claim.
    expect(
      readinessDelta({ verdict: 'now', predictedCentre: null, observedOn: '2026-10-01' })
    ).toBeNull();
  });

  it('says nothing rather than guessing on an unparseable date', () => {
    expect(
      readinessDelta({ verdict: 'now', predictedCentre: 'soon', observedOn: '2026-10-01' })
    ).toBeNull();
    expect(
      readinessDelta({ verdict: 'now', predictedCentre: '2026-10-01', observedOn: 'today' })
    ).toBeNull();
  });
});

describe('describePrediction', () => {
  it('counts the days to a prediction ahead', () => {
    expect(describePrediction('2026-10-08', '2026-10-01')).toBe(
      'Model expects picking in 7 days (8 Oct).'
    );
  });

  it('says today when it is today', () => {
    expect(describePrediction('2026-10-01', '2026-10-01')).toContain('today');
  });

  it('says so when the window has already passed', () => {
    // Worth knowing at the tree: the model thinks you are late.
    expect(describePrediction('2026-09-24', '2026-10-01')).toBe(
      'Model expected picking 7 days ago (24 Sep).'
    );
  });

  it('gets the singular right', () => {
    expect(describePrediction('2026-10-02', '2026-10-01')).toContain('in 1 day (');
    expect(describePrediction('2026-09-30', '2026-10-01')).toContain('1 day ago');
  });

  it('admits when there is no prediction', () => {
    expect(describePrediction(null, '2026-10-01')).toContain('No picking date predicted');
    expect(describePrediction('rubbish', '2026-10-01')).toContain('No picking date predicted');
  });
});
