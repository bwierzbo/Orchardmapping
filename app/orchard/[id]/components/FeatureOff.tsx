import Link from 'next/link';

const COPY: Record<'ipm' | 'nutrition', { title: string; what: string }> = {
  ipm: {
    title: 'Pest management is switched off for this orchard',
    what:
      'the spray programme, what is due this week, and the reviews when the regional advice changes',
  },
  nutrition: {
    title: 'Nutrition is switched off for this orchard',
    what: 'the feeding programme and its recommendations',
  },
};

/**
 * What a page says when its programme is off here.
 *
 * A 404 would be wrong — this is your orchard and it exists. The honest
 * answer is that the page is empty on purpose, plus where the switch is.
 *
 * Off is the default because mapping somebody's trees and running their
 * spray programme are different jobs. Only one of them needs opting
 * into, and it is the one that comes with re-entry intervals attached.
 */
export default function FeatureOff({
  orchardId,
  orchardName,
  feature,
  canEdit,
}: {
  orchardId: string;
  orchardName: string;
  feature: 'ipm' | 'nutrition';
  canEdit: boolean;
}) {
  const copy = COPY[feature];
  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-2xl mx-auto px-5 py-16 pb-safe">
        <h1 className="font-display text-2xl font-semibold text-ink">{copy.title}</h1>
        <p className="mt-2 text-sm text-bark">
          Nothing here is scheduled for {orchardName}, which means no {copy.what}.
        </p>
        <p className="mt-3 text-sm text-bark">
          Everything else works as normal: the map, trees and varieties, walks and
          inspections, harvest records, traps and the pest library. Those are the same
          work whoever owns the trees.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {canEdit && (
            <Link
              href={`/orchard/${orchardId}/dashboard`}
              className="inline-flex px-3 py-2 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700"
            >
              Turn it on from the dashboard
            </Link>
          )}
          <Link
            href={`/orchard/${orchardId}`}
            className="inline-flex px-3 py-2 rounded-md text-sm font-medium bg-surface border border-line text-ink hover:bg-canopy-50"
          >
            Back to the map
          </Link>
        </div>
      </div>
    </main>
  );
}
