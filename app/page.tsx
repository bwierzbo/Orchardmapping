import Link from 'next/link';
import Image from 'next/image';
import { BarChart3, BookOpen, Camera, MapPin, Plus, Settings, Shield } from 'lucide-react';
import {
  satellitePreviewUrl,
  boundarySvgPoints,
  treeSvgPoints,
  contentBounds,
  cardSource,
  dotRadius,
  dotStrokeWidth,
} from '@/lib/satellite-preview';
import { getTreeCountsByOrchard, getTreeExtentsByOrchard } from '@/lib/db/trees';
import { auth } from '@clerk/nextjs/server';
import { memberOrchardConfigs, isGlobalAdmin } from '@/lib/orchard-access';
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
  const { userId } = await auth();
  const signedIn = !!userId;
  // Only orchards you belong to. Signed out, that is none — the list used
  // to show every orchard in the database to anyone who loaded the page.
  const [orchards, treeCounts, treeExtents, globalAdmin] = await Promise.all([
    userId ? memberOrchardConfigs(userId) : Promise.resolve([]),
    getTreeCountsByOrchard(),
    // Where the trees actually are — the stored bounds are the imagery
    // footprint, which is a different thing and often a much bigger one.
    getTreeExtentsByOrchard().catch(
      () => ({}) as Awaited<ReturnType<typeof getTreeExtentsByOrchard>>
    ),
    userId ? isGlobalAdmin(userId) : Promise.resolve(false),
  ]);

  // Count only the trees in orchards you belong to. Summing every count
  // told a signed-in stranger how many trees the database holds, under a
  // list that correctly showed them none.
  const totalTrees = orchards.reduce((sum, o) => sum + (treeCounts[o.id] ?? 0), 0);

  const actions = [
    {
      href: '/discover',
      icon: Camera,
      title: 'Found a Tree',
      sub: 'Photograph a tree anywhere and put it on the map',
    },
    {
      href: '/varieties',
      icon: BookOpen,
      title: 'Variety Library',
      sub: 'Reference notes for every variety you grow',
    },
    ...(signedIn
      ? [
          {
            href: '/orchards/new',
            icon: Plus,
            title: 'Add Orchard',
            sub: 'From a tree photo or a drone orthomosaic',
          },
        ]
      : []),
    {
      href: '/settings',
      icon: Settings,
      title: 'Settings',
      sub: 'Scope the app to your operation',
    },
    // Only the few people who run the system see this at all.
    ...(globalAdmin
      ? [
          {
            href: '/access',
            icon: Shield,
            title: 'Access',
            sub: 'Who can reach which orchards, across the whole system',
          },
        ]
      : []),
  ];

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

      {/* Dashboard header + quick actions */}
      <section className="max-w-6xl mx-auto px-5 pt-8">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Orchard Map</h1>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-bark">
          {orchards.length} {orchards.length === 1 ? 'orchard' : 'orchards'} · {totalTrees} trees
          mapped
        </p>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group bg-surface border border-line rounded-lg p-4 sm:p-5 shadow-xs hover:border-canopy-600 transition-colors duration-base"
              >
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-canopy-50 dark:bg-canopy-600/15 text-canopy-600 group-hover:bg-canopy-600 group-hover:text-white transition-colors duration-base">
                  <Icon aria-hidden size={20} />
                </span>
                <span className="block mt-3 font-display font-semibold text-ink">{a.title}</span>
                <span className="mt-0.5 hidden sm:block text-xs text-bark">{a.sub}</span>
              </Link>
            );
          })}
        </div>
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
              const extent = treeExtents[orchard.id] ?? null;
              // Frame the planting, not the imagery footprint.
              const frame = contentBounds(
                extent?.bounds ?? null,
                orchard.boundary ?? null,
                orchard.bounds
              );
              const dots = extent ? treeSvgPoints(extent.points, frame) : [];
              // Sized to how tightly they are planted, or a dense block
              // merges into one orange rectangle — and the ring goes
              // with it, since at that spacing it is nearly half the dot.
              const r = dotRadius(dots);
              const ring = dotStrokeWidth(r);
              const source = cardSource({
                previewImage: orchard.previewImage,
                boundary: orchard.boundary,
                bounds: orchard.bounds,
                placedTrees: extent?.total ?? 0,
              });
              return (
                <div
                  key={orchard.id}
                  className="group bg-surface border border-line rounded-lg overflow-hidden shadow-xs hover:border-canopy-600 transition-colors duration-base"
                >
                  <Link href={`/orchard/${orchard.id}`} className="block">
                  <div className="relative aspect-[3/2] bg-canopy-50 overflow-hidden">
                    {source === 'uploaded' && orchard.previewImage ? (
                      <Image
                        src={orchard.previewImage}
                        alt={`Aerial view of ${orchard.name}`}
                        fill
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
                      />
                    ) : source === 'composed' ? (
                      // No drone flight yet: live satellite snapshot of the
                      // orchard's location, with its boundary when drawn
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={satellitePreviewUrl(frame)}
                          alt={`Satellite view of ${orchard.name}`}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
                        />
                        {(orchard.boundary || dots.length > 0) && (
                          <svg
                            viewBox="0 0 660 440"
                            preserveAspectRatio="xMidYMid slice"
                            aria-hidden
                            className="absolute inset-0 w-full h-full"
                          >
                            {orchard.boundary && (
                              <polygon
                                points={boundarySvgPoints(orchard.boundary, frame)}
                                fill="rgba(127,154,109,0.15)"
                                stroke="#D9481C"
                                strokeWidth="3"
                              />
                            )}
                            {/*
                              The trees themselves. Most orchards have no
                              traced boundary, so without these the card
                              is a square of grass with nothing to look at.
                            */}
                            {dots.map((d, i) => (
                              <circle
                                key={i}
                                cx={d.x}
                                cy={d.y}
                                r={r}
                                fill="rgba(217,72,28,0.92)"
                                stroke={ring ? '#fff' : undefined}
                                strokeWidth={ring}
                              />
                            ))}
                          </svg>
                        )}
                      </>
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
