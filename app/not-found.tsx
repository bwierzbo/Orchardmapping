import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-5">
      <div className="text-center max-w-md">
        <p className="survey-caption">0 results at these coordinates</p>
        <h1 className="font-display text-3xl font-semibold text-ink mt-3 [text-wrap:balance]">
          This orchard isn&apos;t on the map.
        </h1>
        <p className="text-bark mt-2 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or was removed.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2.5 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 transition-colors duration-base"
        >
          Back to all orchards
        </Link>
      </div>
    </main>
  );
}
