import type { ProvenanceNote } from '@/lib/db/provenance';

const BADGE: Record<ProvenanceNote['confidence'], { label: string; className: string }> = {
  quoted: { label: 'quoted', className: 'text-canopy-700 dark:text-canopy-100' },
  derived: { label: 'derived', className: 'text-bark' },
  assumed: { label: 'assumed', className: 'text-flag-600' },
};

/**
 * Where this step's numbers came from.
 *
 * The repo records these carefully and, until now, showed them only to an
 * audit script — so somebody deciding whether to trust a spray date could
 * not see that the interval behind it was a conservative guess rather
 * than a published figure.
 *
 * Weakest first, deliberately. An assumption is the thing a reader most
 * needs to notice, and burying it under four citations would be a way of
 * hiding it politely.
 */
export default function WhyThisStep({ notes }: { notes: ProvenanceNote[] }) {
  if (notes.length === 0) return null;

  return (
    <details className="mt-1.5 group">
      <summary className="survey-caption cursor-pointer text-bark hover:text-ink list-none">
        Why this timing
        {notes.some((n) => n.confidence === 'assumed') && (
          <span className="ml-1.5 text-flag-600">· includes an assumption</span>
        )}
      </summary>
      <ul className="mt-1.5 space-y-1.5 border-l border-line pl-3">
        {notes.map((n) => (
          <li key={n.subject} className="text-xs">
            <span className={`font-mono text-[10px] uppercase tracking-widest ${BADGE[n.confidence].className}`}>
              {BADGE[n.confidence].label}
            </span>{' '}
            <span className="text-ink">{n.value}</span>
            {n.source && <span className="text-bark"> — {n.source}</span>}
            {n.quote && <p className="mt-0.5 text-bark italic">&ldquo;{n.quote}&rdquo;</p>}
            {n.confidence === 'assumed' && n.note && (
              <p className="mt-0.5 text-bark">{n.note}</p>
            )}
            {n.url && (
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="text-canopy-700 dark:text-canopy-100 hover:underline"
              >
                source
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
