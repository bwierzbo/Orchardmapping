/**
 * What growth stage a photo of an apple tree shows -- a SUGGESTION for the
 * person holding the phone, who confirms or corrects it before anything is
 * recorded (app/orchard/[id]/viewer/BloomStagePhoto.tsx). Nothing here
 * writes a mark.
 *
 * The model is asked against the app's own stage definitions
 * (PHENOLOGY_HELP), so it judges "full bloom" as the stage marker means it
 * -- about 80% of blossoms open -- and not by some other book. It may answer
 * "unsure", and is told to rather than guess: a wrong guess costs a tap to
 * correct, but a confident wrong one is the kind people stop checking.
 *
 * Server only: the Anthropic key is ANTHROPIC_API_KEY in the environment.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { PHENOLOGY_HELP, PHENOLOGY_LABEL, PHOTO_STAGES } from './phenology';

export const StageSuggestion = z.object({
  stage: z.enum([...PHOTO_STAGES, 'unsure']),
  /** Share of blossoms open, for the bloom stages; null when it does not apply or cannot be seen. */
  percentOpen: z.number().int().min(0).max(100).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  /** One sentence on what in the photo decided it. */
  reason: z.string(),
});
export type StageSuggestion = z.infer<typeof StageSuggestion>;

/** Why no suggestion came back, said plainly to the person who took the photo. */
export class StageFromPhotoError extends Error {}

const SCHEMA = {
  type: 'object',
  properties: {
    stage: { type: 'string', enum: [...PHOTO_STAGES, 'unsure'] },
    percentOpen: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['stage', 'percentOpen', 'confidence', 'reason'],
  additionalProperties: false,
} as const;

function instructions(variety: string | null): string {
  const stages = PHOTO_STAGES.map((s) => `- ${s} (${PHENOLOGY_LABEL[s]}): ${PHENOLOGY_HELP[s]}`).join('\n');
  return [
    `This is a photo of an apple tree${variety ? ` (${variety})` : ''} in an orchard, taken to record its growth stage.`,
    'Say which one of these stages it shows, using these definitions exactly:',
    stages,
    'A close-up of a few clusters shows the bud stages well. First bloom, full bloom and petal fall are about the whole tree: estimate the share of blossoms open (percentOpen) from what is visible, and lower your confidence if the photo shows only a few clusters.',
    'When clusters are at different stages, give the stage most of them have reached.',
    'Answer "unsure" if the photo does not show buds or blossoms clearly enough to tell (too far away, blurred, dark, or not an apple tree). Do not guess.',
    'Give percentOpen only for pink, first bloom, full bloom and petal fall; otherwise null.',
    'reason: one short sentence on what you saw.',
  ].join('\n');
}

/**
 * Ask what stage the photo at `photoUrl` shows. Throws StageFromPhotoError
 * with a message for the user when no suggestion can be had.
 */
export async function suggestStageFromPhoto(
  photoUrl: string,
  variety: string | null,
  client?: Anthropic,
): Promise<StageSuggestion> {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new StageFromPhotoError('Reading stages from photos is not set up yet. Record the stage by hand.');
  }
  const anthropic = client ?? new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      // On a policy decline the request is re-run on a fallback model in
      // the same call rather than coming back empty.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: photoUrl } },
            { type: 'text', text: instructions(variety) },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new StageFromPhotoError('Too many photos at once — try again in a minute.');
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new StageFromPhotoError('The photo could not be read. Try another one.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new StageFromPhotoError('The stage reader is not available right now. Record the stage by hand.');
    }
    throw error;
  }
  if (response.stop_reason === 'refusal') {
    throw new StageFromPhotoError('No suggestion for this photo. Record the stage by hand.');
  }
  const text = response.content.find((b) => b.type === 'text');
  let json: unknown = null;
  try {
    json = text?.type === 'text' ? JSON.parse(text.text) : null;
  } catch {
    json = null;
  }
  const parsed = StageSuggestion.safeParse(json);
  if (!parsed.success) {
    throw new StageFromPhotoError('No clear answer for this photo. Record the stage by hand.');
  }
  return parsed.data;
}
