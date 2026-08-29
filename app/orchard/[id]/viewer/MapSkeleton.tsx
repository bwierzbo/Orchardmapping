export default function MapSkeleton() {
  return (
    <div className="h-screen w-screen relative bg-line animate-pulse">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface/95 rounded-lg shadow-lg px-6 py-3 z-10">
        <div className="h-5 w-40 bg-line rounded" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-surface rounded-lg p-6 shadow-2xl flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-canopy-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-ink font-medium">Loading map…</p>
        </div>
      </div>
    </div>
  );
}
