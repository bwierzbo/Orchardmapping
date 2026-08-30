import type { Metadata, Viewport } from 'next';
import { Fraunces, Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import Providers from '@/components/Providers';
import { Toaster } from 'sonner';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
});
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Orchard Map — drone-mapped orchards, tree by tree',
    template: '%s · Orchard Map',
  },
  description:
    'Drone-flown orthomosaic maps of real orchards, with a record for every tree — variety, health, and where it stands in the row.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F6F1' },
    { media: '(prefers-color-scheme: dark)', color: '#101713' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${archivo.variable} ${plexMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ClerkProvider>
          <Providers>
            {children}
            <Toaster richColors position="top-center" />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
