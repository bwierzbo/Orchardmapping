import Link from 'next/link';
import { requireOrchardPage } from '@/lib/orchard-page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import {
  getOrchardIntent,
  listSoilTests,
  listTissueTests,
} from '@/lib/db/nutrition';
import {
  FRUIT_PURPOSE_LABEL,
  LEAF_SUFFICIENCY,
  OPERATION_SCALE_LABEL,
  assessLeafTest,
  intentNotesFor,
  samplingGuidance,
} from '@/lib/nutrition';
import { formatYMD } from '@/lib/dates';
import IntentPicker from './IntentPicker';
import RecordTest from './RecordTest';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — nutrition` : 'Nutrition' };
}

const VERDICT_STYLE = {
  deficient: 'text-flag border-flag',
  excessive: 'text-flag border-flag',
  adequate: 'text-canopy-700 dark:text-canopy-100 border-canopy-600/50',
  unmeasured: 'text-bark border-line',
} as const;

export default async function NutritionPage({ params }: PageProps) {
  const { id } = await params;
  await requireOrchardPage(id);
  const [orchard, { userId }] = await Promise.all([
    getOrchardConfigById(id).catch(() => null),
    auth(),
  ]);
  if (!orchard) notFound();

  const [intent, tissue, soil] = await Promise.all([
    getOrchardIntent(orchard.id),
    listTissueTests(orchard.id).catch(() => []),
    listSoilTests(orchard.id).catch(() => []),
  ]);

  const latest = tissue[0] ?? null;
  const assessed = latest ? assessLeafTest(latest.readings) : [];
  const notes = latest ? intentNotesFor(intent.fruitPurpose, assessed) : [];
  const guidance = samplingGuidance(intent.operationScale);
  const problems = assessed.filter(
    (a) => a.verdict === 'deficient' || a.verdict === 'excessive'
  );

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-4xl mx-auto px-5 py-8 pb-safe">
        <Link
          href={`/orchard/${orchard.id}/dashboard`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-5"
        >
          <ArrowLeft aria-hidden size={16} /> {orchard.name}
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="text-canopy-600" aria-hidden size={22} />
          <h1 className="font-display text-2xl font-semibold text-ink">Nutrition</h1>
        </div>
        <p className="text-bark text-sm mb-6 max-w-2xl">
          A soil test says what is in the ground; a leaf test says what the tree actually
          took up. Neither answers the question alone, which is why both are here.
        </p>

        {/* ── What the orchard is for ── */}
        <section className="bg-surface border border-line rounded-lg p-4 mb-5">
          <p className="survey-caption">This orchard grows</p>
          <p className="text-ink mt-1">
            <strong>{FRUIT_PURPOSE_LABEL[intent.fruitPurpose]}</strong> fruit,{' '}
            {OPERATION_SCALE_LABEL[intent.operationScale].toLowerCase()} scale
          </p>
          <p className="text-xs text-bark mt-2 max-w-2xl">
            This does not change the sufficiency ranges &mdash; those are the same for every
            apple orchard, and WSU says so explicitly. It changes what a reading{' '}
            <em>means</em>, and how much sampling it takes to be representative.
          </p>
          {userId && <IntentPicker orchardId={orchard.id} intent={intent} />}
        </section>

        {/* ── The latest leaf test ── */}
        {latest ? (
          <section className="bg-surface border border-line rounded-lg p-4 mb-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="survey-caption">
                Leaf tissue &middot; {formatYMD(latest.sampledOn)}
                {latest.sampleArea ? ` · ${latest.sampleArea}` : ''}
                {latest.lab ? ` · ${latest.lab}` : ''}
              </p>
              {tissue.length > 1 && (
                <p className="survey-caption">{tissue.length} on record</p>
              )}
            </div>
            <h2 className="font-display text-lg text-ink mt-0.5 mb-3">
              {problems.length === 0
                ? 'Everything measured is in range'
                : `${problems.length} outside the range`}
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse">
                <thead>
                  <tr>
                    {['Nutrient', 'Reading', 'Sufficient', 'Verdict'].map((h) => (
                      <th
                        key={h}
                        className="text-left font-mono text-[10px] uppercase tracking-widest text-bark border-b border-ink pb-1.5 pr-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assessed.map((a) => {
                    const r = LEAF_SUFFICIENCY[a.nutrient];
                    const unit = r.unit === 'percent' ? '%' : 'ppm';
                    return (
                      <tr key={a.nutrient} className="border-b border-line-soft">
                        <td className="py-1.5 pr-3 text-ink">{r.label}</td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums text-ink">
                          {a.value ?? '—'} {unit}
                        </td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums text-bark text-xs">
                          {r.low}–{r.high}
                        </td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={`inline-block font-mono text-[10px] uppercase tracking-widest border rounded-full px-1.5 py-0.5 ${VERDICT_STYLE[a.verdict]}`}
                          >
                            {a.verdict}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {notes.length > 0 && (
              <div className="mt-4 border-l-2 border-canopy-600 pl-3">
                <p className="survey-caption">
                  What this means for {FRUIT_PURPOSE_LABEL[intent.fruitPurpose].toLowerCase()}
                </p>
                <ul className="mt-1.5 space-y-2">
                  {notes.map((n) => (
                    <li key={n.nutrient} className="text-sm text-ink">
                      <span className="font-medium">
                        {LEAF_SUFFICIENCY[n.nutrient].label}:
                      </span>{' '}
                      <span className="text-bark">{n.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="bg-surface border border-line rounded-lg p-4 mb-5">
            <p className="survey-caption">Leaf tissue</p>
            <p className="text-sm text-bark mt-1">
              No test recorded yet. The sample wants taking about 60 days past petal fall
              &mdash; late July here &mdash; when nutrient levels are most stable. The
              programme will ask for it.
            </p>
          </section>
        )}

        {/* ── Soil ── */}
        <section className="bg-surface border border-line rounded-lg p-4 mb-5">
          <p className="survey-caption">Soil</p>
          {soil.length === 0 ? (
            <p className="text-sm text-bark mt-1">
              No soil test recorded. {guidance.soilEvery}.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {soil.slice(0, 4).map((t) => (
                <li key={t.id} className="text-sm">
                  <span className="font-mono tabular-nums text-bark text-xs">
                    {formatYMD(t.sampledOn)}
                  </span>{' '}
                  <span className="text-ink">
                    pH {t.ph ?? '—'}
                    {t.organicMatterPct != null && ` · OM ${t.organicMatterPct}%`}
                    {t.cec != null && ` · CEC ${t.cec}`}
                    {t.values.k != null && ` · K ${t.values.k}`}
                    {t.values.b != null && ` · B ${t.values.b}`}
                  </span>
                  {t.sampleArea && <span className="text-bark text-xs"> · {t.sampleArea}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── How to sample ── */}
        <section className="bg-surface border border-line rounded-lg p-4 mb-5">
          <p className="survey-caption">How to sample, at this scale</p>
          <p className="text-ink mt-1 text-sm">{guidance.composites}</p>
          <p className="text-sm text-bark mt-1">{guidance.note}</p>
          <p className="survey-caption mt-2">Soil: {guidance.soilEvery}</p>
        </section>

        {userId && <RecordTest orchardId={orchard.id} />}

        <p className="survey-caption mt-6">
          Sufficiency ranges: WSU Tree Fruit leaf tissue standards, sampled from recently
          mature leaves between the end of shoot growth and nutrient relocation.
        </p>
      </div>
    </main>
  );
}
