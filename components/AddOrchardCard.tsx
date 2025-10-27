'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AddOrchardCard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleClick = () => {
    if (session) {
      router.push('/orchards/new');
    } else {
      router.push('/login?callbackUrl=/orchards/new');
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <button
        onClick={handleClick}
        className="w-full bg-white/50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-green-400 hover:bg-white/70 transition-all cursor-pointer group"
      >
        <svg
          className="w-12 h-12 text-gray-400 mx-auto mb-4 group-hover:text-green-600 transition-colors"
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
        <h3 className="text-lg font-semibold text-gray-700 mb-2 group-hover:text-green-600 transition-colors">
          Add New Orchard
        </h3>

        {status === 'loading' ? (
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-3">
            Loading...
          </p>
        ) : session ? (
          <>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-3">
              Upload a PMTiles file with orthomosaic imagery to create a new orchard
            </p>
            <span className="inline-flex items-center text-green-600 font-medium text-sm">
              Create Orchard
              <svg
                className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
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
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-3">
              Sign in to upload a PMTiles file and create a new orchard
            </p>
            <span className="inline-flex items-center text-green-600 font-medium text-sm">
              Sign In to Add Orchard
              <svg
                className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
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
          </>
        )}
      </button>
    </div>
  );
}
