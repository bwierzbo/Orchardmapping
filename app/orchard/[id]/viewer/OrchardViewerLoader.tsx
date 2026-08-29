'use client';

import dynamic from 'next/dynamic';
import type { OrchardViewerProps } from './OrchardViewer';
import MapSkeleton from './MapSkeleton';

// maplibre-gl (~900KB) stays out of the route shell; the header/skeleton
// paint before the map bundle parses.
const OrchardViewer = dynamic(() => import('./OrchardViewer'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export default function OrchardViewerLoader(props: OrchardViewerProps) {
  return <OrchardViewer {...props} />;
}
