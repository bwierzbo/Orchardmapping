'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { findTrees } from '@/lib/find-tree';
import { formatTreeLabel } from '@/lib/address';
import type { ClientTree } from '@/lib/types';

/**
 * Go to a tree by typing it: "R13 P21", "405", a tree id, or a variety.
 * Picking a dot by eye among hundreds is how an inspection lands one tree
 * off; typing the address goes to that tree and no other.
 */
export default function FindTree({
  trees,
  onPick,
}: {
  trees: readonly ClientTree[];
  onPick: (tree: ClientTree) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const result = useMemo(() => findTrees(trees, query), [trees, query]);

  const pick = (tree: ClientTree) => {
    onPick(tree);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Find a tree"
          title="Find a tree"
          className="shrink-0 rounded-lg p-1.5 text-bark hover:bg-canopy-50 hover:text-ink"
        >
          <Search aria-hidden size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && result.trees[0]) pick(result.trees[0]);
          }}
          placeholder="R13 P21, tree 405, or a variety"
          aria-label="Tree to find"
          className="h-9"
        />
        {query.trim() !== '' && (
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {result.trees.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-bark">No tree matches that.</li>
            ) : (
              result.trees.map((t) => (
                <li key={t.tree_id}>
                  <button
                    type="button"
                    onClick={() => pick(t)}
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-canopy-50"
                  >
                    <span className="block text-sm font-medium text-ink">{formatTreeLabel(t)}</span>
                    <span className="block text-xs text-bark">{t.variety || 'No variety'}</span>
                  </button>
                </li>
              ))
            )}
            {result.total > result.trees.length && (
              <li className="px-2 pt-1 text-xs text-bark">
                {result.total - result.trees.length} more — type more to narrow it down.
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
