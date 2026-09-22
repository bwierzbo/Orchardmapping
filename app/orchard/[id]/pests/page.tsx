import Link from 'next/link';
import { orchardRegion } from '@/lib/db/regions';
import { requireOrchardPage } from '@/lib/orchard-page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Bug } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { listPests, observationCounts } from '@/lib/db/pests';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — pests & diseases` : 'Pests & diseases' };
}

/** Regional prevalence, not a universal ranking — the copy says so. */
const PREVALENCE_STYLE: Record<string, { label: string; className: string }> = {
  high: { label: 'Common here', className: 'bg-status-dead/15 text-status-dead' },
  moderate: { label: 'Occasional', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  low: { label: 'Minor', className: 'bg-canopy-600/15 text-canopy-700 dark:text-canopy-100' },
  absent: { label: 'Not found here', className: 'bg-line text-bark' },
  beneficial: { label: 'Beneficial', className: 'bg-canopy-600/20 text-canopy-700 dark:text-canopy-100' },
};

/**
 * Shown when this orchard's region has no assessment for a pest — which
 * is not the same as "not found here", and must not borrow another
 * region's answer.
 */
const UNASSESSED = { label: 'Not assessed here', className: 'bg-line text-bark' };

const CATEGORY_ORDER = ['disease', 'insect', 'mite', 'beneficial', 'vertebrate'];
const CATEGORY_LABEL: Record<string, string> = {
  disease: 'Diseases',
  insect: 'Insects',
  mite: 'Mites',
  beneficial: 'Beneficials',
  vertebrate: 'Vertebrates',
};

export default async function PestsPage({ params }: PageProps) {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchardConfigById(id).catch(() => null);
  if (!orchard) notFound();

  const region = await orchardRegion(id);
  const [entries, counts] = await Promise.all([
    listPests(region?.key ?? null),
    observationCounts(orchard.id).catch(() => ({} as Record<string, number>)),
  ]);

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: entries.filter((e) => e.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-4xl mx-auto px-5 py-8 pb-safe">
        <Link
          href={`/orchard/${orchard.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-5"
        >
          <ArrowLeft aria-hidden size={16} /> {orchard.name}
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Bug className="text-canopy-600" aria-hidden size={22} />
          <h1 className="font-display text-2xl font-semibold text-ink">
            Pests &amp; diseases
          </h1>
        </div>
        <p className="text-bark text-sm mb-6 max-w-2xl">
          Written for maritime Washington in the Olympic rain shadow, so the ranking
          differs from eastern-Washington guides — and for cider, where cosmetic damage
          doesn&apos;t count. Open an entry to see what it looks like, how to tell it from
          its look-alikes, and what treats it.
        </p>

        {grouped.map((group) => (
          <section key={group.category} className="mb-7">
            <h2 className="font-mono text-xs uppercase tracking-widest text-bark mb-2">
              {CATEGORY_LABEL[group.category] ?? group.category}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.items.map((e) => {
                const style = (e.prevalence && PREVALENCE_STYLE[e.prevalence]) || UNASSESSED;
                const seen = counts[e.key] ?? 0;
                return (
                  <li key={e.key}>
                    <Link
                      href={`/orchard/${orchard.id}/pests/${e.key}`}
                      className="block h-full bg-surface border border-line rounded-lg p-3 hover:border-canopy-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{e.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      {e.scientific_name && (
                        <p className="text-xs italic text-bark/80">{e.scientific_name}</p>
                      )}
                      <p className="text-xs text-bark mt-1">{e.summary}</p>
                      {seen > 0 && (
                        <p className="text-[11px] text-canopy-700 dark:text-canopy-100 mt-1.5">
                          {seen} sighting{seen === 1 ? '' : 's'} logged here
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
