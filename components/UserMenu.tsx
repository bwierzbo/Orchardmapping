'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { ChevronDown, LogOut, Moon, Plus, Sun, Upload } from 'lucide-react';
import Link from 'next/link';

export default function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // true after hydration; avoids server/client theme-icon mismatch
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const themeButton = mounted ? (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="p-2 rounded-md text-bark hover:text-ink hover:bg-canopy-50 transition-colors duration-base"
    >
      {resolvedTheme === 'dark' ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
    </button>
  ) : (
    <span className="p-2 w-[34px]" aria-hidden />
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-1">
        {themeButton}
        <span className="w-20 h-9 rounded-md bg-line/60 animate-pulse" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        {themeButton}
        <Link
          href="/login"
          className="bg-canopy-600 text-white dark:text-paper px-4 py-2 rounded-md hover:bg-canopy-700 transition-colors duration-base text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {themeButton}
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-2 bg-surface border border-line rounded-md px-2.5 py-1.5 hover:bg-canopy-50 transition-colors duration-base"
        >
          <span className="w-7 h-7 bg-canopy-600 rounded-full flex items-center justify-center text-white dark:text-paper text-sm font-medium">
            {(user.firstName || user.primaryEmailAddress?.emailAddress || 'U').charAt(0).toUpperCase()}
          </span>
          <span className="text-sm font-medium text-ink hidden sm:block">{user.firstName || user.username || ''}</span>
          <ChevronDown
            aria-hidden
            size={16}
            className={`text-bark transition-transform duration-base ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-52 bg-surface border border-line rounded-lg shadow-md py-1 z-50"
          >
            <div className="px-3 py-2 border-b border-line">
              <p className="text-sm font-medium text-ink truncate">{user.fullName || user.username}</p>
              <p className="text-xs text-bark truncate">{user.primaryEmailAddress?.emailAddress}</p>
            </div>
            <Link
              href="/orchards/new"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canopy-50"
            >
              <Plus aria-hidden size={16} /> Add orchard
            </Link>
            <Link
              href="/"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canopy-50"
            >
              <Upload aria-hidden size={16} /> All orchards
            </Link>
            <button
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push('/');
                router.refresh();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canopy-50"
            >
              <LogOut aria-hidden size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
