import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Orchard Map',
    short_name: 'Orchard Map',
    description: 'Drone-mapped orchards with a record for every tree.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F6F1',
    theme_color: '#14211A',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
