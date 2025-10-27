'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AddOrchardFAB() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showTooltip, setShowTooltip] = useState(false);

  // Only show FAB if user is authenticated
  if (!session) {
    return null;
  }

  const handleClick = () => {
    router.push('/orchards/new');
  };

  return (
    <div className="fixed bottom-8 right-8 z-40">
      <div className="relative">
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap shadow-lg">
            Add New Orchard
            <div className="absolute top-full right-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        )}

        {/* Floating Action Button */}
        <button
          onClick={handleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="w-16 h-16 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center group"
          aria-label="Add New Orchard"
        >
          <svg
            className="w-8 h-8 transition-transform group-hover:rotate-90 duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
