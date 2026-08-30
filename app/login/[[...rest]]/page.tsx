import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-paper px-5 gap-5">
      <SignIn />
      <p className="text-sm text-bark">
        For collaborators. Just visiting?{' '}
        <Link href="/" className="text-canopy-600 hover:text-canopy-700 underline underline-offset-2">
          The maps are public →
        </Link>
      </p>
      <p className="survey-caption">Orchard Map · Field Access</p>
    </main>
  );
}
