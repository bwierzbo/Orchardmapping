import Link from 'next/link';
import { getAllOrchards } from '../lib/orchards';

export default function Home() {
  const orchards = getAllOrchards();

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
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

                  {/* Stats Grid */}
                  {orchard.stats && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {orchard.stats.trees && (
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-500">Trees</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {orchard.stats.trees.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {orchard.stats.acres && (
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-500">Acres</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {orchard.stats.acres}
                          </p>
                        </div>
                      )}
                      {orchard.stats.blocks && (
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-500">Blocks</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {orchard.stats.blocks}
                          </p>
                        </div>
                      )}
                      {orchard.stats.rows && (
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-500">Rows</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {orchard.stats.rows}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* View Button */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      Zoom: {orchard.tileMinZoom}-{orchard.tileMaxZoom}
                    </span>
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

        {/* Add New Orchard Card */}
        <div className="max-w-6xl mx-auto mt-6">
          <div className="bg-white/50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              Add Your Orchard
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              To add a new orchard, place your orthomosaic tiles and PMTiles in the public/orchards directory
              and update the configuration in lib/orchards.ts
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Powered by MapLibre GL &amp; PMTiles</p>
          <p className="mt-1">High-resolution orthomosaic imagery with vector overlays</p>
        </div>
      </div>
    </main>
  );
}