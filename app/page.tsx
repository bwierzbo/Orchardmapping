import Link from 'next/link';
import Image from 'next/image';
import { BarChart3, MapPin, Plus } from 'lucide-react';
import { getAllOrchardConfigs } from '@/lib/db/orchards';
import { getTreeCountsByOrchard } from '@/lib/db/trees';
import { auth } from '@clerk/nextjs/server';
import UserMenu from '@/components/UserMenu';
import type { OrchardConfig } from '@/lib/types';

// Live DB data (orchards + tree counts) — never prerender at build time
export const dynamic = 'force-dynamic';

function surveyCaption(orchard: OrchardConfig, treeCount: number): string {
  const [lng, lat] = orchard.center;
  const latStr = `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`;
  const parts = [latStr, lngStr];
  if (treeCount > 0) parts.push(`${treeCount} trees`);
  return parts.join('  ·  ');
}

export default async function Home() {
  const [orchards, treeCounts, { userId }] = await Promise.all([
    getAllOrchardConfigs(),
    getTreeCountsByOrchard(),
    auth(),
  ]);
  const signedIn = !!userId;

  const hero = orchards.find((o) => o.previewImage) ?? orchards[0];
  const totalTrees = Object.values(treeCounts).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid grid-cols-3 gap-[3px] p-1.5 bg-ink dark:bg-canopy-100 rounded-md"
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1 h-1 rounded-full ${i === 4 ? 'bg-flag-600' : 'bg-paper dark:bg-ink'}`}
                />
              ))}
            </span>
            <span className="font-display font-semibold text-lg text-ink">Orchard Map</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {hero?.previewImage ? (
          <div className="relative h-[46vh] min-h-[320px] max-h-[520px] overflow-hidden">
            <Image
              src={hero.previewImage}
              alt={`Aerial orthomosaic of ${hero.name}`}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#14211A]/85 via-[#14211A]/30 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0">
              <div className="max-w-6xl mx-auto px-5 pb-8">
                <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white max-w-2xl [text-wrap:balance]">
                  {orchards.length === 1 ? 'One orchard' : `${orchards.length} orchards`}, mapped
                  tree by tree.
                </h1>
                <p className="mt-3 text-white/85 max-w-xl text-sm sm:text-base">
                  Drone-flown orthomosaic maps with a record for every tree — variety, health, and
                  where it stands in the row.
                </p>
                <p className="mt-4 pt-3 border-t border-white/25 font-mono text-[11px] uppercase tracking-widest text-white/70">
                  {surveyCaption(hero, totalTrees)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-5 pt-16 pb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink max-w-2xl [text-wrap:balance]">
              Orchards, mapped tree by tree.
            </h1>
            <p className="mt-3 text-bark max-w-xl">
              Drone-flown orthomosaic maps with a record for every tree.
            </p>
          </div>
        )}
      </section>

      {/* Orchard plates */}
      <section className="max-w-6xl mx-auto px-5 py-10">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-xl font-semibold text-ink">Orchards</h2>
          {signedIn && (
            <Link
              href="/orchards/new"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-canopy-600 hover:text-canopy-700"
            >
              <Plus aria-hidden size={16} /> Add orchard
            </Link>
          )}
        </div>

        {orchards.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg bg-surface p-10 text-center">
            <p className="text-ink font-medium">No orchards yet</p>
            <p className="text-sm text-bark mt-1">
              {signedIn
                ? 'Add your first orchard to get a map on the wall.'
                : 'Nothing has been mapped here yet — check back soon.'}
            </p>
            {signedIn && (
              <Link
                href="/orchards/new"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700"
              >
                <Plus aria-hidden size={16} /> Add orchard
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {orchards.map((orchard) => {
              const count = treeCounts[orchard.id] ?? 0;
              return (
                <div
                  key={orchard.id}
                  className="group bg-surface border border-line rounded-lg overflow-hidden shadow-xs hover:border-canopy-600 transition-colors duration-base"
                >
                  <Link href={`/orchard/${orchard.id}`} className="block">
                  <div className="relative aspect-[3/2] bg-canopy-50 overflow-hidden">
                    {orchard.previewImage ? (
                      <Image
                        src={orchard.previewImage}
                        alt={`Aerial view of ${orchard.name}`}
                        fill
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MapPin aria-hidden className="text-canopy-600/40" size={40} />
                      </div>
                    )}
                  </div>
                    <div className="px-5 pt-5">
                      <h3 className="font-display text-lg font-semibold text-ink">
                        {orchard.name}
                      </h3>
                      <p className="flex items-center gap-1 text-sm text-bark mt-0.5">
                        <MapPin aria-hidden size={14} /> {orchard.location}
                      </p>
                    </div>
                  </Link>
                  <div className="px-5 pb-5 mt-3 pt-3 border-t border-line flex items-center justify-between gap-3">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-bark truncate">
                      {surveyCaption(orchard, count)}
                    </p>
                    <Link
                      href={`/orchard/${orchard.id}/dashboard`}
                      className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-canopy-600 hover:text-canopy-700"
                    >
                      <BarChart3 aria-hidden size={14} /> Dashboard
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-line mt-6">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm text-bark">
            Flown, stitched, and mapped by Ben Wierzbanowski.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-bark/70">
            OpenDroneMap · MapLibre GL · PMTiles
          </p>
        </div>
      </footer>
    </main>
  );
}
