'use client';

import { useEffect, useState } from 'react';
import type { ClientTree } from '@/lib/types';
import { formatYMD } from '@/lib/dates';
import { fetchTreeEvents, type ClientTreeEvent } from '@/lib/api/trees';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import TreeHistory from './TreeHistory';

/**
 * The tree that stood here before, under the one that stands here now.
 *
 * A removed tree is off the map, so this is the way back to it: what it was,
 * when it came out and why, and -- on request -- its whole history, read
 * only. If it had itself replaced an earlier tree, that one follows below.
 */
export default function ReplacedTree({ treeId }: { treeId: string }) {
  const [tree, setTree] = useState<ClientTree | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ClientTreeEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    trpc.tree.get
      .query({ treeId })
      .then((t) => {
        if (live) setTree(t);
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [treeId]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchTreeEvents(treeId)
      .then((e) => {
        if (live) setEvents(e);
      })
      .catch(() => {
        if (live) setEvents([]);
      });
    return () => {
      live = false;
    };
  }, [open, treeId]);

  if (missing) {
    return (
      <p className="text-sm text-bark py-2">
        Planted in place of {treeId}, which is no longer on record.
      </p>
    );
  }
  if (!tree) return <p className="text-sm text-bark py-2">…</p>;

  return (
    <div className="py-2 border-t border-line">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">
          <span className="text-bark">In place of </span>
          <span className="font-medium text-ink">
            Tree {tree.tree_no ?? tree.tree_id} · {tree.variety ?? 'unknown variety'}
          </span>
          {tree.removed_on && (
            <span className="text-bark">
              {' '}
              — removed {formatYMD(tree.removed_on)}
              {tree.removed_reason ? `: ${tree.removed_reason}` : ''}
            </span>
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide history' : 'Its history'}
        </Button>
      </div>
      {open && (
        <TreeHistory
          key={tree.tree_id}
          treeId={tree.tree_id}
          canEdit={false}
          events={events}
          onEventsChange={setEvents}
        />
      )}
      {tree.replaces_tree_id && <ReplacedTree treeId={tree.replaces_tree_id} />}
    </div>
  );
}
