import Link from 'next/link';
import { getAllOrchards } from '../lib/orchards';
import AddOrchardFAB from '@/components/AddOrchardFAB';
import AddOrchardCard from '@/components/AddOrchardCard';
import { getTreeCountsByOrchard } from '../lib/db/trees';

export default async function Home() {
  const orchards = getAllOrchards();

  // Get actual tree counts from database
  const treeCounts = await getTreeCountsByOrchard();

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Floating Action Button - only visible when authenticated */}
      <AddOrchardFAB />

      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Orchard Mapping Platform
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Advanced precision agriculture visualization. Select an orchard to view detailed orthomosaic imagery and tree-level data.
          </p>
        </div>

        {/* Orchard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {orchards.map((orchard) => (
            <Link
              key={orchard.id}
              href={`/orchard/${orchard.id}`}
              className="group"
            >
              <div className="bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                {/* Preview Image Placeholder */}
                <div className="h-48 bg-gradient-to-br from-green-400 to-green-600 relative overflow-hidden">
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-24 h-24 text-white/50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  {/* Status Badge */}
                  <div className="absolute top-4 right-4">
                    <span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
                      Active
                    </span>
                  </div>
                </div>

                {/* Orchard Info */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
                    {orchard.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    📍 {orchard.location}
                  </p>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {orchard.description}
                  </p>

                  {/* Stats - Dynamic tree count from database */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-500 text-center">Trees</p>
                    <p className="text-2xl font-bold text-gray-900 text-center">
                      {(treeCounts[orchard.id] || 0).toLocaleString()}
                    </p>
                  </div>

                  {/* View Button */}
                  <div className="flex items-center justify-end">
                    <span className="inline-flex items-center text-green-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
                      View Map
                      <svg
                        className="w-4 h-4 ml-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Add New Orchard Card - Auth-aware */}
        <AddOrchardCard />

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Powered by MapLibre GL &amp; PMTiles</p>
          <p className="mt-1">High-resolution orthomosaic imagery with vector overlays</p>
        </div>
      </div>
    </main>
  );
}