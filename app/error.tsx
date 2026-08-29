'use client';

import Link from 'next/link';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="bg-surface rounded-lg p-8 shadow-xl flex flex-col items-center gap-4 max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="text-bark text-sm">
          This is usually temporary. Try again, or head back to the orchards.
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-canopy-600 text-white rounded-lg hover:bg-canopy-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-paper text-ink rounded-lg hover:bg-line transition-colors"
          >
            All orchards
          </Link>
        </div>
      </div>
    </div>
  );
}
