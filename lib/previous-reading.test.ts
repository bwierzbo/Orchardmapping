import { describe, it, expect } from 'vitest';
import { previousReading, readingDelta } from './previous-reading';

const brix = { sugar: 'brix' as const, size: 'mm' as const };
const sg = { sugar: 'sg' as const, size: 'mm' as const };
const inches = { sugar: 'brix' as const, size: 'in' as const };

describe('previousReading', () => {
  it('shows a measured value to one decimal', () => {
    expect(previousReading('starch_index', 4, brix)).toEqual({ ghost: '4', was: 'was 4' });
    expect(previousReading('brix', 12.9, brix)).toEqual({ ghost: '12.9', was: 'was 12.9' });
  });

  it('converts to the unit on screen, not the one it was stored in', () => {
    // Stored canonical as Brix; the form is showing SG.
    const r = previousReading('brix', 12.9, sg)!;
    expect(Number(r.ghost)).toBeGreaterThan(1.04);
    expect(Number(r.ghost)).toBeLessThan(1.06);
    expect(r.ghost).toMatch(/^1\.\d{3}$/);
  });

  it('converts millimetres to inches when the form is in inches', () => {
    const r = previousReading('size_mm', 58, inches)!;
    expect(r.ghost).toBe('2.3');
    expect(r.was).toContain('in');
  });

  it('leaves a count without a forced decimal', () => {
    expect(previousReading('drop_count', 12, brix)!.ghost).toBe('12');
    expect(previousReading('seed_color', 2, brix)!.ghost).toBe('2');
  });

  it('is null when there is nothing to show', () => {
    expect(previousReading('brix', undefined, brix)).toBeNull();
    expect(previousReading('brix', Number.NaN, brix)).toBeNull();
  });
});

describe('readingDelta', () => {
  it('reports a rise and a fall', () => {
    expect(readingDelta('6', 4)).toEqual({ text: '+2', direction: 'up' });
    expect(readingDelta('3', 4)).toEqual({ text: '−1', direction: 'down' });
  });

  it('keeps one decimal for a fractional change', () => {
    expect(readingDelta('14.6', 12.9)!.text).toBe('+1.7');
  });

  it('says nothing when nothing has been typed', () => {
    // The field is empty and the ghost is showing; there is no change yet.
    expect(readingDelta('', 4)).toBeNull();
    expect(readingDelta('   ', 4)).toBeNull();
  });

  it('says nothing when the value has not really moved', () => {
    // "+0" is noise, and so is a rounding artefact.
    expect(readingDelta('4', 4)).toBeNull();
    expect(readingDelta('4.01', 4)).toBeNull();
  });

  it('says nothing when there is no previous reading', () => {
    expect(readingDelta('6', undefined)).toBeNull();
  });

  it('says nothing for text that is not a number', () => {
    expect(readingDelta('abc', 4)).toBeNull();
  });
});
