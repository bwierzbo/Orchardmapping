'use client';

import { useEffect, useState } from 'react';
import { PMTiles } from 'pmtiles';

export default function DebugPage() {
  const [orthoInfo, setOrthoInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkPMTiles() {
      try {
        const url = 'http://localhost:3000/orchards/manytreesorchard/manytrees.pmtiles';
        console.log('Checking PMTiles at:', url);

        const pmtiles = new PMTiles(url);
        const header = await pmtiles.getHeader();
        const metadata = await pmtiles.getMetadata();

        setOrthoInfo({
          header,
          metadata,
          url
        });
      } catch (err: any) {
        console.error('PMTiles check error:', err);
        setError(err.message);
      }
    }

    checkPMTiles();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">PMTiles Debug</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {orthoInfo && (
        <div>
          <h2 className="text-xl font-semibold mb-2">File Info</h2>
          <div className="bg-gray-100 p-4 rounded mb-4">
            <p><strong>URL:</strong> {orthoInfo.url}</p>
          </div>

          <h3 className="text-lg font-semibold mb-2">Header</h3>
          <pre className="bg-gray-100 p-4 rounded mb-4 overflow-auto">
            {JSON.stringify(orthoInfo.header, null, 2)}
          </pre>

          <h3 className="text-lg font-semibold mb-2">Metadata</h3>
          <pre className="bg-gray-100 p-4 rounded mb-4 overflow-auto">
            {JSON.stringify(orthoInfo.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
