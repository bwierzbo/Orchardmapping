import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { isGlobalAdmin } from '@/lib/orchard-access';
import { getAllOrchardConfigs } from '@/lib/db/orchards';
import { listPeople } from '@/lib/db/people';
import UserMenu from '@/components/UserMenu';
import AccessConsole from './AccessConsole';

// Access changes the moment someone is granted a level — never cache it.
export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const { userId } = await auth();
  // notFound rather than a refusal: this page does not confirm its own
  // existence to people who may not use it.
  if (!userId || !(await isGlobalAdmin(userId))) notFound();

  const [people, orchards] = await Promise.all([listPeople(), getAllOrchardConfigs()]);

  return (
    <main className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink"
          >
            <ArrowLeft size={15} aria-hidden />
            Orchard Map
          </Link>
          <UserMenu />
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-5 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Access</h1>
          <p className="mt-1 text-sm text-bark max-w-2xl">
            A system-wide level reaches every orchard, including ones created later — keep it to the
            few people who run this. Everyone else gets access to particular orchards, and an
            orchard&rsquo;s own admins manage that themselves. Where someone has both, the higher one
            wins.
          </p>
        </div>

        <AccessConsole
          initialPeople={people}
          orchards={orchards.map((o) => ({ id: o.id, name: o.name }))}
          yourUserId={userId}
        />
      </section>
    </main>
  );
}
