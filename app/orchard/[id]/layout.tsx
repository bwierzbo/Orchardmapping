import { notFound } from 'next/navigation';
import { viewerRole } from '@/lib/orchard-access';

/**
 * Membership gate for everything under /orchard/[id].
 *
 * One place rather than nine, because the failure mode of per-page checks
 * is the page someone forgets. The orchard id comes from the URL, so
 * without this any signed-in user reaches any orchard by typing its id —
 * and before this, so did signed-out visitors, since the pages only used
 * the session to decide whether to show edit controls.
 *
 * Non-members and signed-out visitors get the same 404. A 403 would
 * confirm that someone else's orchard exists.
 */
export default async function OrchardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await viewerRole(id);
  if (!role) notFound();
  return <>{children}</>;
}
