'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

function safeCallbackUrl(raw: string | null): string {
  // Only allow same-site relative paths — never an absolute URL
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-line rounded-lg shadow-xs overflow-hidden">
          <div aria-hidden className="h-1.5 bg-gradient-to-r from-canopy-600 via-canopy-700 to-flag-600" />
          <div className="p-7">
            <h1 className="font-display text-2xl font-semibold text-ink">Sign in</h1>
            <p className="text-sm text-bark mt-1">
              For collaborators. Just visiting?{' '}
              <Link href="/" className="text-canopy-600 hover:text-canopy-700 underline underline-offset-2">
                The maps are public →
              </Link>
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-status-dead/10 border border-status-dead/30 text-status-dead px-3.5 py-2.5 rounded-md text-sm"
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-medium text-bark mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full px-3.5 py-2 bg-surface text-ink border border-line rounded-md focus:ring-2 focus:ring-canopy-600 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-medium text-bark mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2 bg-surface text-ink border border-line rounded-md focus:ring-2 focus:ring-canopy-600 focus:border-transparent outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-canopy-600 text-white dark:text-paper py-2.5 px-4 rounded-md hover:bg-canopy-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-base font-medium flex items-center justify-center gap-2"
              >
                {loading && <Loader2 aria-hidden size={16} className="animate-spin" />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
        <p className="survey-caption text-center mt-5">Orchard Map · Field Access</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-paper">
          <Loader2 aria-hidden size={24} className="animate-spin text-bark" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
