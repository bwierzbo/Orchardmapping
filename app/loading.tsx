export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <div className="container mx-auto px-4 py-12 animate-pulse">
        <div className="text-center mb-12">
          <div className="h-10 w-72 bg-gray-200 rounded mx-auto mb-4" />
          <div className="h-5 w-96 max-w-full bg-gray-200 rounded mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow p-0 overflow-hidden">
              <div className="h-48 bg-gray-200" />
              <div className="p-6 space-y-3">
                <div className="h-6 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-56 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
