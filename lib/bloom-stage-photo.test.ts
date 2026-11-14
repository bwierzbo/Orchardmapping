import { afterEach, describe, expect, it } from 'vitest';
import { StageFromPhotoError, StageSuggestion, suggestStageFromPhoto } from './bloom-stage-photo';

const saved = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved;
});

describe('suggestStageFromPhoto', () => {
  it('says plainly that it is not set up when there is no API key, without calling out', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const call = suggestStageFromPhoto('https://abc.public.blob.vercel-storage.com/photos/T/1.jpg', 'Kingston Black');
    await expect(call).rejects.toBeInstanceOf(StageFromPhotoError);
    await expect(call).rejects.toThrow(/not set up/);
  });
});

describe('StageSuggestion', () => {
  it('accepts an answer in the shape asked for, unsure included', () => {
    expect(StageSuggestion.safeParse({ stage: 'full_bloom', percentOpen: 80, confidence: 'high', reason: 'Most blossoms open.' }).success).toBe(true);
    expect(StageSuggestion.safeParse({ stage: 'unsure', percentOpen: null, confidence: 'low', reason: 'Too far away.' }).success).toBe(true);
  });

  it('refuses a stage outside the photo stages or an impossible share open', () => {
    expect(StageSuggestion.safeParse({ stage: 'harvest', percentOpen: null, confidence: 'high', reason: '' }).success).toBe(false);
    expect(StageSuggestion.safeParse({ stage: 'pink', percentOpen: 140, confidence: 'high', reason: '' }).success).toBe(false);
  });
});
