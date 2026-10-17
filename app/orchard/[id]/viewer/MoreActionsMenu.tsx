'use client';

import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The map's occasional actions, kept off the toolbar: the bar is for what
 * happens every visit (a walk, a group action), and these happen a few
 * times a season. Areas and tree detection are drawing work for a computer,
 * so they are offered there only.
 */
export default function MoreActionsMenu({
  atDesk,
  onAddTrees,
  onTraps,
  onAreas,
  onDetect,
}: {
  atDesk: boolean;
  onAddTrees: () => void;
  onTraps: () => void;
  onAreas: () => void;
  onDetect: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="More map actions"
          className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50"
        >
          <MoreHorizontal aria-hidden size={16} />
          More
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="min-w-[11rem]">
        <DropdownMenuItem onSelect={onAddTrees}>Add trees</DropdownMenuItem>
        <DropdownMenuItem onSelect={onTraps}>Hang traps</DropdownMenuItem>
        {atDesk && <DropdownMenuItem onSelect={onAreas}>Areas</DropdownMenuItem>}
        {atDesk && <DropdownMenuItem onSelect={onDetect}>Detect trees</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
