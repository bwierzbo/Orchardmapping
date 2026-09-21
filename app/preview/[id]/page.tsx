import { notFound } from 'next/navigation';
import { getOrchardConfigById } from '@/lib/db/orchards';
import PreviewMap from './PreviewMap';
import { viewerRole } from '@/lib/orchard-access';

export const dynamic = 'force-dynamic';

/**
 * Chromeless map render used to generate orchard preview images
 * (scripts capture a screenshot of this page). Dev-only.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { id } = await params;
  // Chromeless, but it still renders a real orchard's boundary and map.
  const role = await viewerRole(id);
  if (!role) notFound();

  const orchard = await getOrchardConfigById(id);
  if (!orchard) notFound();
  return <PreviewMap orchard={orchard} />;
}
