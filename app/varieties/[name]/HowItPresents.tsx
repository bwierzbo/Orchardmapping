import {
  classify,
  describeDivergence,
  CLASS_LABEL,
  TANNIN_THRESHOLD_PCT,
  ACID_THRESHOLD_PCT,
  type CiderClass,
} from '@/lib/cider-class';
import type { VarietyObservation } from '@/lib/db/varieties';

/**
 * What a variety's juice actually measured, against what it is.
 *
 * The canonical class is the page's headline and stays there. This sits
 * underneath it, subordinate and always attributed, because a measurement
 * from somebody else's trial ground is evidence about that ground first
 * and about the variety second.
 *
 * Every observation shows which side of each threshold it fell on, so a
 * reader can audit the classification rather than take it. And each one's
 * caveats are printed with it, at the point where they would otherwise be
 * persuaded — not in a footnote.
 */
export default function HowItPresents({
  canonical,
  observations,
  sites,
}: {
  canonical: CiderClass | null;
  observations: VarietyObservation[];
  sites: Array<{ site: string; trees: number }>;
}) {
  const measuredSites = new Set(
    observations.filter((o) => o.scopeKind === 'site').map((o) => o.scopeValue.toLowerCase())
  );
  const unmeasured = sites.filter((s) => !measuredSites.has(s.site.toLowerCase()));

  // Nothing measured and nothing planted: there is nothing to say.
  if (observations.length === 0 && unmeasured.length === 0) return null;

  return (
    <section className="mt-4">
      <h2 className="survey-caption mb-2">How it presents</h2>

      <div className="rounded-xl border border-line bg-surface divide-y divide-line">
        {observations.map((o, i) => {
          const result = classify({ tanninPct: o.tanninPct, acidPct: o.acidPct });
          const divergence = describeDivergence(canonical, result, scopePhrase(o));

          return (
            <div key={i} className="p-4 space-y-2">
              {divergence && (
                <p className="text-sm text-ink font-medium">{divergence}</p>
              )}

              <p className="survey-caption text-bark/80">
                {o.scopeValue}
                {seasons(o) && ` · ${seasons(o)}`}
              </p>

              <dl className="font-mono text-xs text-ink space-y-0.5">
                {o.tanninPct != null && (
                  <Axis
                    label="tannin"
                    value={o.tanninPct}
                    threshold={TANNIN_THRESHOLD_PCT}
                    over="bitter"
                    under="not bitter"
                  />
                )}
                {o.acidPct != null && (
                  <Axis
                    label="acid"
                    value={o.acidPct}
                    threshold={ACID_THRESHOLD_PCT}
                    over="sharp"
                    under="not sharp"
                  />
                )}
                {(o.ph != null || o.sg != null || o.brix != null) && (
                  <div className="text-bark">
                    {[
                      o.ph != null ? `pH ${o.ph}` : null,
                      o.sg != null ? `SG ${o.sg}` : null,
                      o.brix != null ? `${o.brix} °Bx` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </dl>

              <p className="text-xs text-bark">
                {result.ciderClass
                  ? `Computes as ${CLASS_LABEL[result.ciderClass]}.`
                  : result.reason}
                {o.tanninMethod === 'unknown' && o.tanninPct != null && (
                  <>
                    {' '}
                    The analytical method is not stated, so it is not certain the{' '}
                    {TANNIN_THRESHOLD_PCT}% permanganate line is the right comparison.
                  </>
                )}
              </p>

              {o.note && <p className="text-xs text-bark/80">{o.note}</p>}

              {o.source && (
                <p className="text-xs text-bark/70">
                  {o.url ? (
                    <a href={o.url} className="underline hover:text-ink" target="_blank" rel="noreferrer">
                      {o.source}
                    </a>
                  ) : (
                    o.source
                  )}
                </p>
              )}
            </div>
          );
        })}

        {unmeasured.map((s) => (
          <p key={s.site} className="p-4 text-xs text-bark">
            <span className="text-ink">{s.site}</span> · {s.trees}{' '}
            {s.trees === 1 ? 'tree' : 'trees'} · no juice recorded yet
          </p>
        ))}
      </div>
    </section>
  );
}

/** One axis, with the threshold it was judged against shown beside it. */
function Axis({
  label,
  value,
  threshold,
  over,
  under,
}: {
  label: string;
  value: number;
  threshold: number;
  over: string;
  under: string;
}) {
  const isOver = value > threshold;
  return (
    <div className="flex gap-2">
      <span className="w-14 text-bark">{label}</span>
      <span className="w-16">{value}%</span>
      <span className="text-bark">
        {isOver ? 'over' : 'under'} {threshold}% → {isOver ? over : under}
      </span>
    </div>
  );
}

function seasons(o: VarietyObservation): string | null {
  if (o.seasonFrom == null && o.seasonTo == null) return null;
  if (o.seasonFrom != null && o.seasonTo != null && o.seasonFrom !== o.seasonTo) {
    return `${o.seasonFrom}–${o.seasonTo} means`;
  }
  return String(o.seasonTo ?? o.seasonFrom);
}

/** How the divergence sentence names where the fruit grew. */
function scopePhrase(o: VarietyObservation): string {
  const when = seasons(o);
  const where =
    o.scopeKind === 'site' ? `at ${o.scopeValue}` : `in ${o.scopeValue}`;
  return when ? `${where}, ${when.replace(' means', '')}` : where;
}
