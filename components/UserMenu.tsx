'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { ChevronDown, LogOut, Moon, Plus, Settings, Sun, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // true after hydration; avoids server/client theme-icon mismatch
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const themeButton = mounted ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="text-bark hover:text-ink"
    >
      {resolvedTheme === 'dark' ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
    </Button>
  ) : (
    <span className="p-2 w-[36px]" aria-hidden />
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
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {themeButton}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 px-2.5">
            <span className="w-7 h-7 bg-canopy-600 rounded-full flex items-center justify-center text-white dark:text-paper text-sm font-medium">
              {(user.firstName || user.primaryEmailAddress?.emailAddress || 'U').charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-medium text-ink hidden sm:block">
              {user.firstName || user.username || ''}
            </span>
            <ChevronDown aria-hidden size={16} className="text-bark" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <p className="text-sm font-medium text-ink truncate">{user.fullName || user.username}</p>
            <p className="text-xs font-normal text-bark truncate">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/orchards/new">
              <Plus aria-hidden size={16} /> Add orchard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/">
              <Upload aria-hidden size={16} /> All orchards
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings aria-hidden size={16} /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              router.push('/');
              router.refresh();
            }}
          >
            <LogOut aria-hidden size={16} /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
