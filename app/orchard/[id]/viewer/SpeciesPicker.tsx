'use client';

import { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { trpc } from '@/lib/trpc/client';
import { normalizeSpecies } from '@/lib/variety-filter';

/**
 * Pick a species from a list you can scroll, or type one that isn't on it --
 * the same control as the variety picker, since the two are filled in
 * together. The list is what grows here plus a common set, and whatever is
 * chosen is stored lower-case so "Pear" and "pear" stay one species.
 */
export default function SpeciesPicker({
  orchardId,
  value,
  onChange,
  placeholder = 'Species',
}: {
  orchardId: string;
  value: string;
  onChange: (species: string) => void;
  placeholder?: string;
}) {
  const [species, setSpecies] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    trpc.tree.fruitTypes
      .query({ orchardId })
      .then((f) => {
        if (live) setSpecies(f);
      })
      .catch(() => {
        // Typing a species still works without the list.
      });
    return () => {
      live = false;
    };
  }, [orchardId]);

  const items = useMemo(() => {
    const current = normalizeSpecies(value);
    const all = current && !species.includes(current) ? [current, ...species] : species;
    return all.map((s) => ({ value: s, label: s }));
  }, [species, value]);

  return (
    <SearchableSelect
      options={items}
      value={normalizeSpecies(value)}
      onValueChange={(v) => onChange(normalizeSpecies(v))}
      placeholder={placeholder}
      searchPlaceholder="Type to search…"
      emptyText="No match — type a name to add it"
      onCreate={(query) => {
        const name = normalizeSpecies(query);
        if (name) onChange(name);
      }}
      createLabel={(query) => `Use "${normalizeSpecies(query)}"`}
    />
  );
}
