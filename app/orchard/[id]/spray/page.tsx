import Link from 'next/link';
import { requireOrchardPage } from '@/lib/orchard-page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, SprayCan } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { listSprayTargets } from '@/lib/db/spray';
import SprayClient from './SprayClient';

// Live DB data; never prerender at build time
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — spray & IPM` : 'Spray & IPM' };
}

export default async function SprayPage({ params }: PageProps) {
  const { id } = await params;
  await requireOrchardPage(id);
  const [orchard, targets] = await Promise.all([
    getOrchardConfigById(id).catch(() => null),
    // The pest library is the vocabulary; the form must not keep its own
    listSprayTargets().catch(() => []),
  ]);
  if (!orchard) notFound();

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
          <SprayCan className="text-canopy-600" aria-hidden size={22} />
          <h1 className="font-display text-2xl font-semibold text-ink">Spray &amp; IPM</h1>
        </div>
        <p className="text-bark text-sm mb-6 max-w-2xl">
          What you applied, where, and when — the record a certifier or inspector asks
          for. The material list and its warnings follow the program you pick below.
        </p>

        <SprayClient orchardId={orchard.id} targets={targets} />
      </div>
    </main>
  );
}
