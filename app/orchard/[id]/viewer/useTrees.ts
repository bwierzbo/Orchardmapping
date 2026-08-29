import { useCallback, useMemo, useState } from 'react';
import type { ClientTree } from '@/lib/types';
import * as api from '@/lib/api/trees';

export type Notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;

/**
 * Single source of truth for the orchard's trees, with optimistic
 * mutations: apply locally, call the API, replace with the server row on
 * success, roll back on failure.
 */
export function useTrees(initialTrees: ClientTree[], orchardId: string, notify: Notify) {
  const [trees, setTrees] = useState<ClientTree[]>(initialTrees);

  const byId = useMemo(() => {
    const m = new Map<string, ClientTree>();
    for (const t of trees) m.set(t.tree_id, t);
    return m;
  }, [trees]);

  const refresh = useCallback(async () => {
    try {
      setTrees(await api.fetchTrees(orchardId));
    } catch {
      notify('error', 'Failed to reload trees');
    }
  }, [orchardId, notify]);

  const create = useCallback(
    async (input: Omit<api.TreeCreateInput, 'orchard_id'>): Promise<ClientTree | null> => {
      try {
        const tree = await api.createTree({ ...input, orchard_id: orchardId });
        setTrees((prev) => [...prev, tree]);
        return tree;
      } catch (error) {
        notify('error', error instanceof api.ApiError ? error.message : 'Failed to add tree');
        return null;
      }
    },
    [orchardId, notify]
  );

  const update = useCallback(
    async (treeId: string, patch: api.TreeUpdateInput): Promise<boolean> => {
      const before = trees.find((t) => t.tree_id === treeId);
      if (!before) return false;
      // optimistic
      setTrees((prev) =>
        prev.map((t) => (t.tree_id === treeId ? ({ ...t, ...patch } as ClientTree) : t))
      );
      try {
        const saved = await api.updateTree(treeId, patch);
        setTrees((prev) => prev.map((t) => (t.tree_id === treeId ? saved : t)));
        return true;
      } catch (error) {
        setTrees((prev) => prev.map((t) => (t.tree_id === treeId ? before : t)));
        notify('error', error instanceof api.ApiError ? error.message : 'Failed to save tree');
        return false;
      }
    },
    [trees, notify]
  );

  const move = useCallback(
    async (treeId: string, lng: number, lat: number): Promise<boolean> => {
      return update(treeId, { lng, lat });
    },
    [update]
  );

  const remove = useCallback(
    async (treeId: string): Promise<boolean> => {
      const before = trees;
      setTrees((prev) => prev.filter((t) => t.tree_id !== treeId));
      try {
        await api.deleteTree(treeId);
        notify('success', 'Tree deleted');
        return true;
      } catch (error) {
        setTrees(before);
        notify('error', error instanceof api.ApiError ? error.message : 'Failed to delete tree');
        return false;
      }
    },
    [trees, notify]
  );

  return { trees, byId, refresh, create, update, move, remove };
}
