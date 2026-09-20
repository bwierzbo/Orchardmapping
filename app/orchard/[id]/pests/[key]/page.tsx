import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, SprayCan } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { getPest, listObservations } from '@/lib/db/pests';
import { listMaterials } from '@/lib/db/spray';
import { getProgramMode } from '@/lib/db/spray';
import { recommendFor, PROGRAM_MODE_LABEL, type ProgramMode } from '@/lib/spray-rules';
import ObserveBox from './ObserveBox';
import PosturePicker from './PosturePicker';
import { listPostures } from '@/lib/db/posture';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; key: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  const entry = await getPest(key).catch(() => null);
  return { title: entry ? entry.name : 'Pest or disease' };
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="mb-5">
      <h2 className="font-mono text-xs uppercase tracking-widest text-bark mb-1.5">
        {title}
      </h2>
      <p className="text-ink text-sm leading-relaxed whitespace-pre-line">{body}</p>
    </section>
  );
}

export default async function PestDetailPage({ params }: PageProps) {
  const { id, key } = await params;
  const [orchard, entry] = await Promise.all([
    getOrchardConfigById(id).catch(() => null),
    getPest(key).catch(() => null),
  ]);
  if (!orchard || !entry) notFound();

  // Same keys drive the material library, so "what treats this?" needs no
  // extra mapping — and it arrives already scoped to the program mode.
  const [library, mode, observations, postures, { userId }] = await Promise.all([
    listMaterials().catch(() => []),
    getProgramMode(orchard.id).catch(() => 'organic_practices' as ProgramMode),
    listObservations(orchard.id, key).catch(() => []),
    listPostures(orchard.id).catch(() => []),
    auth(),
  ]);
  const posture = postures.find((p) => p.pestKey === key) ?? null;
  const options = recommendFor(library, entry.key, mode as ProgramMode);

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-3xl mx-auto px-5 py-8 pb-safe">
        <Link
          href={`/orchard/${orchard.id}/pests`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-5"
        >
          <ArrowLeft aria-hidden size={16} /> Pests &amp; diseases
        </Link>

        <h1 className="font-display text-2xl font-semibold text-ink">{entry.name}</h1>
        {entry.scientific_name && (
          <p className="italic text-bark text-sm">{entry.scientific_name}</p>
        )}
        <p className="text-ink mt-3 mb-6">{entry.summary}</p>

        <Section title="What you'll see" body={entry.symptoms} />
        <Section title="Don't confuse it with" body={entry.lookalikes} />
        <Section title="Life cycle" body={entry.lifecycle} />
        <Section title="When it matters" body={entry.timing} />
        <Section title="How to scout it" body={entry.monitoring} />
        <Section title="Management" body={entry.management} />
        <Section title="For cider specifically" body={entry.cider_note} />

        {options.length > 0 && (
          <section className="mb-6 rounded-lg border border-canopy-600/30 bg-canopy-50 dark:bg-canopy-600/10 p-4">
            <h2 className="flex items-center gap-1.5 font-display text-base text-ink">
              <SprayCan size={16} className="text-canopy-600" aria-hidden />
              What you have for it
            </h2>
            <p className="text-xs text-bark mt-0.5 mb-2">
              Ranked for this orchard&apos;s program ({PROGRAM_MODE_LABEL[mode as ProgramMode]}).
              Always follow the label.
            </p>
            <ol className="space-y-1.5">
              {options.slice(0, 4).map((m, i) => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium text-ink">
                    {i + 1}. {m.name}
                  </span>
                  {m.omri_listed && (
                    <span className="ml-1.5 text-[11px] rounded-full bg-canopy-600/20 px-1.5 py-0.5 text-canopy-700 dark:text-canopy-100">
                      OMRI
                    </span>
                  )}
                  {m.notes && <span className="block text-xs text-bark">{m.notes}</span>}
                </li>
              ))}
            </ol>
            <Link
              href={`/orchard/${orchard.id}/spray`}
              className="inline-block mt-3 text-sm font-medium text-canopy-700 dark:text-canopy-100 hover:underline"
            >
              Record an application →
            </Link>
          </section>
        )}

        {userId && (
          <PosturePicker
            orchardId={orchard.id}
            pestKey={entry.key}
            pestName={entry.name}
            current={posture?.posture ?? null}
            currentNote={posture?.note ?? null}
          />
        )}

        <ObserveBox
          orchardId={orchard.id}
          pestKey={entry.key}
          pestName={entry.name}
          initial={observations}
        />

        {entry.refs.length > 0 && (
          <p className="mt-6 text-xs text-bark">
            Sources: {entry.refs.join(' · ')}
          </p>
        )}
      </div>
    </main>
  );
}
