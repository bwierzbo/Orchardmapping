export default function Loading() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="border-b border-line bg-surface/80 sticky top-0">
        <div className="max-w-6xl mx-auto px-5 py-4">
          <div className="h-7 w-52 bg-line rounded animate-pulse" />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-5 py-8 space-y-6 animate-pulse">
        <div className="h-3 w-80 max-w-full bg-line rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface border border-line rounded-lg" />
          ))}
        </div>
        <div className="h-28 bg-surface border border-line rounded-lg" />
        <div className="h-64 bg-surface border border-line rounded-lg" />
        <div className="h-48 bg-surface border border-line rounded-lg" />
      </div>
    </main>
  );
}
