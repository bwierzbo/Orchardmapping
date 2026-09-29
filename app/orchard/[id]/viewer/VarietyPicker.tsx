'use client';

import { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { trpc } from '@/lib/trpc/client';
import type { VarietyOption } from '@/lib/db/varieties';
import { visibleVarieties, varietyDescription } from '@/lib/variety-filter';

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
  fruitType,
}: {
  orchardId: string;
  value: string;
  onChange: (variety: string) => void;
  placeholder?: string;
  /**
   * Narrow the list to one species. A variety the library doesn't know is
   * always offered: nothing says a grower's own seedling is the wrong
   * species, and hiding it would push them to retype a name that already
   * exists -- the duplicate this picker exists to prevent.
   */
  fruitType?: string;
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
    const visible = visibleVarieties(options, fruitType);
    const seen = new Set(visible.map((o) => o.name.toLowerCase()));
    const extra: VarietyOption[] = [value, ...typed]
      .filter((n) => n && !seen.has(n.toLowerCase()))
      .map((n) => ({
        name: n,
        summary: 'not in the library',
        inLibrary: false,
        treeCount: 0,
        fruitType: null,
      }));
    return [...extra, ...visible].map((o) => ({
      value: o.name,
      label: o.name,
      description: varietyDescription(o, fruitType),
    }));
  }, [options, typed, value, fruitType]);

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
