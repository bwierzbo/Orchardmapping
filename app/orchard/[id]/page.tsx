import { cache } from 'react';
import { requireOrchardPage } from '@/lib/orchard-page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { getTreesByOrchard } from '@/lib/db/trees';
import { serializeTree } from '@/lib/serialize';
import OrchardViewerLoader from './viewer/OrchardViewerLoader';
import { roleAtLeast, memberOrchardConfigs } from '@/lib/orchard-access';

// Live DB data; never prerender at build time
export const dynamic = 'force-dynamic';

const getOrchard = cache(getOrchardConfigById);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
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
  const role = await requireOrchardPage(id);

  const { userId } = await auth();
  const [orchard, allOrchards, trees] = await Promise.all([
    getOrchard(id),
    userId ? memberOrchardConfigs(userId) : Promise.resolve([]),
    getTreesByOrchard(id),
  ]);

  // A genuine miss (query succeeded, no row) — DB failures throw to error.tsx
  if (!orchard) notFound();

  const canEdit = !!role && roleAtLeast(role, 'operator');

  return (
    <OrchardViewerLoader
      orchard={orchard}
      allOrchards={allOrchards}
      initialTrees={trees.map(serializeTree)}
      canEdit={canEdit}
    />
  );
}
