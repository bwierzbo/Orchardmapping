'use client';

import { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { trpc } from '@/lib/trpc/client';
import type { VarietyOption } from '@/lib/db/varieties';

/**
 * Pick a variety by name, with the curated library behind it.
 *
 * Typing a name that isn't there is allowed and offered explicitly — a
 * grower's own seedling has to be recordable. What it is not is the
 * *only* way in, which is how one planting ended up as Wegnar, Wegner
 * and wegner in three adjacent positions.
 *
 * The typed name is used as-is on the tree and is not written into the
 * library, so a misspelling does not become a permanent option for
 * everyone. It does come back as an option for this orchard, because the
 * list includes whatever is already growing here.
 */
export default function VarietyPicker({
  orchardId,
  value,
  onChange,
  placeholder = 'Search varieties…',
}: {
  orchardId: string;
  value: string;
  onChange: (variety: string) => void;
  placeholder?: string;
}) {
  const [options, setOptions] = useState<VarietyOption[]>([]);
  const [typed, setTyped] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    trpc.tree.varieties
      .query({ orchardId })
      .then((v) => {
        if (live) setOptions(v);
      })
      .catch(() => {
        // The picker degrades to whatever has been typed this session
        // rather than blocking the edit.
      });
    return () => {
      live = false;
    };
  }, [orchardId]);

  const items = useMemo(() => {
    const seen = new Set(options.map((o) => o.name.toLowerCase()));
    const extra = [value, ...typed]
      .filter((n) => n && !seen.has(n.toLowerCase()))
      .map((n) => ({ name: n, summary: 'not in the library', inLibrary: false, treeCount: 0 }));
    return [...extra, ...options].map((o) => ({
      value: o.name,
      label: o.name,
      description: o.summary ?? undefined,
    }));
  }, [options, typed, value]);

  return (
    <SearchableSelect
      options={items}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Type to search…"
      emptyText="No match — type a name to add it"
      onCreate={(query) => {
        const name = query.trim();
        if (!name) return;
        setTyped((prev) => (prev.includes(name) ? prev : [...prev, name]));
        onChange(name);
      }}
      createLabel={(query) => `Use "${query.trim()}"`}
    />
  );
}
