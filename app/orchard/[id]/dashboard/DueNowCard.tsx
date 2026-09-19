import Link from 'next/link';
import { ClipboardCheck, Eye } from 'lucide-react';
import { resolveSchedule } from '@/lib/db/schedule';
import { nowLocalIso } from '@/lib/openmeteo';
import { formatYMD } from '@/lib/dates';
import StepDoneButton from './StepDoneButton';

/**
 * What the program asks for right now.
 *
 * The whole point of the trigger model is this card: three or four
 * lines you read on a Tuesday morning. Steps that are open lead;
 * standing watches follow, because "go and look" is a different kind of
 * instruction from "go and do". Everything upcoming, waiting on a mark,
 * done or past is deliberately not here — that is the season view's job.
 */
export default async function DueNowCard({
  orchardId,
  canEdit,
}: {
  orchardId: string;
  canEdit: boolean;
}) {
  const today = nowLocalIso().slice(0, 10);
  const schedule = await resolveSchedule(orchardId, today).catch(() => []);
  const due = schedule.filter((r) => r.status === 'due');
  const watches = schedule.filter((r) => r.status === 'monitor');
  const doneCount = schedule.filter((r) => r.status === 'done').length;

  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
      <p className="survey-caption">Program · Due now</p>

      {due.length === 0 && watches.length === 0 ? (
        <p className="text-sm text-bark mt-2">
          Nothing open today.{' '}
          {doneCount > 0 && `${doneCount} step${doneCount === 1 ? '' : 's'} done this season.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {due.map((r) => (
            <li key={r.step.key} className="flex items-start gap-3">
              <ClipboardCheck
                aria-hidden
                size={16}
                className="text-flag-600 shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink font-medium leading-snug">{r.step.title}</p>
                <p className="text-xs text-bark mt-0.5">{r.step.detail}</p>
                <p className="survey-caption mt-1">
                  {r.end
                    ? `Through ${formatYMD(r.end)}`
                    : `Open since ${formatYMD(r.start)} · ${r.why}`}
                  {r.lastDoneOn && ` · last done ${formatYMD(r.lastDoneOn)}`}
                </p>
                {r.step.pestKey && (
                  <Link
                    href={`/orchard/${orchardId}/pests/${r.step.pestKey}`}
                    className="text-xs text-canopy-700 dark:text-canopy-100 hover:underline"
                  >
                    What this is for →
                  </Link>
                )}
              </div>
              {canEdit && (
                <StepDoneButton orchardId={orchardId} stepKey={r.step.key} today={today} />
              )}
            </li>
          ))}

          {watches.map((r) => (
            <li key={r.step.key} className="flex items-start gap-3">
              <Eye aria-hidden size={16} className="text-bark shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-ink leading-snug">{r.step.title}</p>
                <p className="text-xs text-bark mt-0.5">{r.step.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
