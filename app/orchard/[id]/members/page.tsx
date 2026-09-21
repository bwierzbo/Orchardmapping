import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Users } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { listMembers, listPendingInvitations } from '@/lib/db/members';
import { viewerRole, roleAtLeast } from '@/lib/orchard-access';
import MembersClient from './MembersClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — people` : 'People' };
}

export default async function MembersPage({ params }: PageProps) {
  const { id } = await params;
  const orchard = await getOrchardConfigById(id).catch(() => null);
  if (!orchard) notFound();

  const role = await viewerRole(id);
  if (!role) notFound();
  const isAdmin = roleAtLeast(role, 'admin');

  const [members, pending] = await Promise.all([
    listMembers(id),
    isAdmin ? listPendingInvitations(id) : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href={`/orchard/${id}/dashboard`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden />
          {orchard.name}
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-ink flex items-center gap-2">
          <Users aria-hidden size={20} className="text-canopy-600 shrink-0" />
          People
        </h1>
        <p className="mt-1 text-sm text-bark">
          Who can reach this orchard, and what they may change. Everyone here sees
          the same records — roles decide who can add to them.
        </p>

        <MembersClient
          orchardId={id}
          initialMembers={members}
          initialPending={pending}
          yourRole={role}
        />
      </div>
    </div>
  );
}
