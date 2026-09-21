import type { RefBloomSpread } from '@/lib/phenology';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05-16" → "16 May". */
function label(mmdd: string): string {
  const [m, d] = mmdd.split('-');
  return `${Number(d)} ${MONTH[Number(m) - 1]}`;
}

/**
 * How far apart the varieties bloom, from WSU Mount Vernon reference dates.
 *
 * This is the one thing the reference data can say before anything has
 * bloomed here, and it answers a question worth asking early: whether a
 * single stage-anchored pass can cover the block at all. It deliberately
 * does not predict a date for this orchard — Mount Vernon is 70 miles
 * east, and the gap between first and last travels far better than either
 * date does, since a warm spring moves the whole planting forward together.
 */
export default function BloomSpread({ spread }: { spread: RefBloomSpread }) {
  // Varieties sharing a date share a tick, or they would sit on top of
  // each other — three of them do, at 19 April.
  const ticks = new Map<string, { offsetDays: number; varieties: string[]; trees: number }>();
  for (const r of spread.order) {
    const t = ticks.get(r.mmdd!) ?? { offsetDays: r.offsetDays, varieties: [], trees: 0 };
    t.varieties.push(r.variety);
    t.trees += r.trees;
    ticks.set(r.mmdd!, t);
  }
  const undatedTrees = spread.undated.reduce((a, r) => a + r.trees, 0);
  const maxTrees = Math.max(...[...ticks.values()].map((t) => t.trees));
  // A stage-anchored spray holds for roughly a week before the early end
  // is past it and the late end has not reached it.
  const onePassPlausible = spread.days <= 7;

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <p className="survey-caption">Bloom spread · reference</p>
      <p className="text-sm text-ink mt-1">
        <span className="font-semibold">{spread.days} days</span> from{' '}
        {spread.earliest.variety} to {spread.latest.variety}
        <span className="text-bark">
          {onePassPlausible
            ? ' — close enough that one pass should catch every variety at the same stage.'
            : ' — too wide for one pass to catch every variety at the same stage.'}
        </span>
      </p>

      <div className="mt-3">
        <div className="relative h-9">
          <div className="absolute inset-x-0 top-3 h-px bg-line" aria-hidden />
          {[...ticks.entries()].map(([mmdd, t]) => (
            <div
              key={mmdd}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${(t.offsetDays / spread.days) * 100}%` }}
              title={`${t.varieties.join(', ')} — ${label(mmdd)}, ${t.trees} trees`}
            >
              <div
                className="rounded-full bg-canopy-600"
                // Scaled by tree count, so the blocks that dominate a spray
                // decision read heavier than a single specimen tree.
                style={{
                  width: `${6 + (t.trees / maxTrees) * 8}px`,
                  height: `${6 + (t.trees / maxTrees) * 8}px`,
                  marginTop: `${12 - (6 + (t.trees / maxTrees) * 8) / 2}px`,
                }}
              />
              <span className="mt-1 text-[10px] font-mono text-bark whitespace-nowrap">
                {label(mmdd)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-bark mt-3 leading-snug">
        Mean bloom at the WSU Mount Vernon trial, not this orchard — ordering and
        rough timing only. Covers {spread.order.length} of{' '}
        {spread.order.length + spread.undated.length} varieties
        {undatedTrees > 0 && `; ${spread.undated.length} more (${undatedTrees} trees) have no trial date`}.
      </p>
    </div>
  );
}
