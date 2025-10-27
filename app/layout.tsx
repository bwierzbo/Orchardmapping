import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'
import UserMenu from '@/components/UserMenu'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Orchard Map',
  description: 'A Next.js application for orchard mapping',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {/* User Menu - Fixed Position */}
          <div className="fixed top-4 right-4 z-50">
            <UserMenu />
          </div>

          {children}
        </Providers>
      </body>
    </html>
  )
}