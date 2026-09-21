import { Sprout } from 'lucide-react';
import { listMarks, listVarieties, pendingRollUps, refBlooms } from '@/lib/db/phenology';
import {
  PHENOLOGY_LABEL,
  currentStage,
  daysBetween,
  refBloomSpread,
  remainingStages,
  seasonOf,
} from '@/lib/phenology';
import { formatYMD } from '@/lib/dates';
import { nowLocalIso } from '@/lib/openmeteo';
import { orchardTimezone } from '@/lib/db/orchards';
import StageMarker from './StageMarker';
import RollUpPrompt from './RollUpPrompt';
import BloomSpread from './BloomSpread';

/**
 * Where the block is in the season, and the control to record the next
 * stage. Stage-anchored spray timing has no other source — a calendar
 * cannot place "copper at half-inch green" until someone says when that
 * happened, and it moves a fortnight either way year to year.
 */
export default async function StageCard({
  orchardId,
  canEdit,
}: {
  orchardId: string;
  canEdit: boolean;
}) {
  const today = nowLocalIso(await orchardTimezone(orchardId)).slice(0, 10);
  const season = seasonOf(today);
  const [marks, varieties, rollUps, blooms] = await Promise.all([
    listMarks(orchardId).catch(() => []),
    listVarieties(orchardId).catch(() => []),
    // What walk mode has seen but the programme has not been told.
    pendingRollUps(orchardId, season).catch(() => []),
    refBlooms(orchardId).catch(() => []),
  ]);
  const spread = refBloomSpread(blooms);
  const current = currentStage(marks, today);
  const thisSeason = marks.filter((m) => seasonOf(m.observedOn) === season);
  const remaining = remainingStages(marks, today);

  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
      <p className="survey-caption">Season · Growth stage</p>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Sprout aria-hidden size={18} className="text-canopy-600 shrink-0" />
            {current ? PHENOLOGY_LABEL[current.stage] : 'Not recorded yet'}
          </h2>
          {current ? (
            <p className="text-sm text-bark mt-0.5">
              Reached {formatYMD(current.observedOn)} ·{' '}
              {daysBetween(current.observedOn, today)} days ago
            </p>
          ) : (
            <p className="text-sm text-bark mt-0.5">
              Tell the app when you see green tip — {season}&rsquo;s spray timing hangs off these dates, and nine steps are waiting on them.
            </p>
          )}
        </div>

        {canEdit && remaining.length > 0 && (
          <StageMarker
            orchardId={orchardId}
            stages={remaining}
            today={today}
            varieties={varieties}
          />
        )}
      </div>

      {canEdit && rollUps.length > 0 && (
        <RollUpPrompt
          orchardId={orchardId}
          suggestions={rollUps.map((r) => ({
            variety: r.variety,
            stage: r.stage,
            atOrPast: r.atOrPast,
            observed: r.observed,
            reachedOn: r.reachedOn,
          }))}
        />
      )}

      {thisSeason.length > 0 && (
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {thisSeason.map((m) => (
            <li key={m.id} className="text-[12px] leading-tight">
              <span className={m.id === current?.id ? 'text-ink font-medium' : 'text-bark'}>
                {PHENOLOGY_LABEL[m.stage]}
              </span>{' '}
              <span className="font-mono text-bark">{m.observedOn.slice(5)}</span>
            </li>
          ))}
        </ol>
      )}

      {spread && <BloomSpread spread={spread} />}
    </section>
  );
}
