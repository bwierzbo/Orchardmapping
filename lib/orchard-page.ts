import { notFound } from 'next/navigation';
import { viewerRole } from './orchard-access';
import type { OrchardRole } from './roles';

/**
 * Prove membership inside the page itself, before it fetches anything.
 *
 * The layout gate is not enough, and the reason is easy to miss: a layout
 * and the page it wraps render in PARALLEL. When the layout calls
 * notFound() the visitor is shown a 404, but the page has already run —
 * it fetched the orchard and its trees, and that data is serialised into
 * the response anyway. The gate protected the interface and not the
 * payload, which is how /orchard/<id> came to answer an anonymous request
 * with all 480 of an orchard's tree ids.
 *
 * So every page under /orchard/[id] calls this as its first await, and
 * fetches nothing before it. The layout keeps its own check: it is what
 * makes the 404 appear promptly, and two gates are cheaper than the bug.
 *
 * Non-members and signed-out visitors get the same 404. A 403 would
 * confirm that someone else's orchard exists.
 */
export async function requireOrchardPage(orchardId: string): Promise<OrchardRole> {
  const role = await viewerRole(orchardId);
  if (!role) notFound();
  return role;
}
