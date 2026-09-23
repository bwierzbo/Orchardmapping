'use client';

import Link from 'next/link';

/**
 * Errors thrown inside a route. Anything above this — the root layout,
 * a hydration failure of the whole document — lands in global-error.tsx
 * instead.
 *
 * The name and digest are shown rather than swallowed: this page used to
 * say only "Something went wrong", which is true of every error and
 * useful for none of them. Somebody in an orchard cannot open a browser
 * console, so if the page will not say what broke, nobody can report it.
 */
export default function RouteError({
  error,
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
        <pre className="w-full text-left text-[11px] leading-relaxed bg-paper border border-line rounded-md p-2.5 whitespace-pre-wrap break-words overflow-x-auto text-bark">
          {error.name}: {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
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
