import { notFound } from 'next/navigation';
import { getOrchardConfigById } from '@/lib/db/orchards';
import PreviewMap from './PreviewMap';

export const dynamic = 'force-dynamic';

/**
 * Chromeless map render used to generate orchard preview images
 * (scripts capture a screenshot of this page). Dev-only.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { id } = await params;
  const orchard = await getOrchardConfigById(id);
  if (!orchard) notFound();
  return <PreviewMap orchard={orchard} />;
}
