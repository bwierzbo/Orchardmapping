import { sql } from '@vercel/postgres';

/**
 * Where a number came from, ready to show beside it.
 *
 * The repo records 20 of these and a commit once claimed "every encoded
 * number now says where it came from" — but they were visible only to an
 * audit script. A grower deciding whether to trust a spray date could not
 * see that the interval behind it was somebody's conservative guess.
 *
 * Confidence is the point, not decoration. 'assumed' means nobody has a
 * source, and those are the ones that bite.
 */
export interface ProvenanceNote {
  subject: string;
  value: string;
  confidence: 'quoted' | 'derived' | 'assumed';
  source: string | null;
  quote: string | null;
  url: string | null;
  note: string | null;
}

function decode(r: Record<string, unknown>): ProvenanceNote {
  return {
    subject: String(r.subject),
    value: String(r.value_text ?? ''),
    confidence: r.confidence as ProvenanceNote['confidence'],
    source: (r.source as string | null) ?? null,
    quote: (r.quote as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

/**
 * Provenance for a set of steps, keyed by step key.
 *
 * A subject may name several steps at once ("cm_oil_375 / cm_gen1_425 /
 * cm_gen2_1400"), so matching is by containment rather than equality.
 * Material-level notes — copper's re-entry, its season cap — attach to
 * every step that uses that material, because that is where somebody is
 * about to act on them.
 */
export async function provenanceForSteps(
  steps: ReadonlyArray<{ key: string; materialKey: string | null }>
): Promise<Map<string, ProvenanceNote[]>> {
  const byStep = new Map<string, ProvenanceNote[]>();
  if (steps.length === 0) return byStep;

  const { rows } = await sql`SELECT * FROM value_provenance`;
  const all = rows.map(decode);

  for (const step of steps) {
    const matches = all.filter((p) => {
      if (p.subject.includes(step.key)) return true;
      if (step.materialKey && p.subject.startsWith(`spray_materials.${step.materialKey}.`)) {
        return true;
      }
      return false;
    });
    if (matches.length > 0) {
      // Weakest first: an assumption is what a reader most needs to see.
      const rank = { assumed: 0, derived: 1, quoted: 2 } as const;
      byStep.set(
        step.key,
        matches.sort((a, b) => rank[a.confidence] - rank[b.confidence])
      );
    }
  }
  return byStep;
}
