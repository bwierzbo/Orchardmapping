import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getOrchardConfigById, getAllOrchardConfigs } from '@/lib/db/orchards';
import { getTreesByOrchard } from '@/lib/db/trees';
import { serializeTree } from '@/lib/serialize';
import OrchardViewerLoader from './viewer/OrchardViewerLoader';

// Live DB data; never prerender at build time
export const dynamic = 'force-dynamic';

const getOrchard = cache(getOrchardConfigById);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const orchard = await getOrchard(id).catch(() => null);
  if (!orchard) return { title: 'Orchard Map' };
  const description = `Drone-mapped orthomosaic of ${orchard.name}${orchard.location ? ` in ${orchard.location}` : ''}, with a record for every tree.`;
  return {
    title: orchard.name,
    description,
    openGraph: orchard.previewImage
      ? {
          title: orchard.name,
          description,
          images: [{ url: orchard.previewImage, width: 1200, height: 800 }],
        }
      : undefined,
  };
}

export default async function OrchardPage({ params }: PageProps) {
  const { id } = await params;

  const [orchard, allOrchards, trees, session] = await Promise.all([
    getOrchard(id),
    getAllOrchardConfigs(),
    getTreesByOrchard(id),
    auth(),
  ]);

  // A genuine miss (query succeeded, no row) — DB failures throw to error.tsx
  if (!orchard) notFound();

  return (
    <OrchardViewerLoader
      orchard={orchard}
      allOrchards={allOrchards}
      initialTrees={trees.map(serializeTree)}
      canEdit={!!session?.user}
    />
  );
}
