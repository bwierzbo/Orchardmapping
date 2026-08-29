'use client';

import Link from 'next/link';

export default function OrchardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center gap-4 max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong loading this orchard
        </h1>
        <p className="text-gray-600 text-sm">
          This is usually temporary — a network hiccup or a database blip.
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors"
          >
            All orchards
          </Link>
        </div>
      </div>
    </div>
  );
}
