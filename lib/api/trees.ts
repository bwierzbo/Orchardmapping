import { TRPCClientError } from '@trpc/client';
import type { ClientTree } from '../types';
import { trpc } from '../trpc/client';

/**
 * Typed client for the tree API.
 *
 * Tree CRUD rides the tRPC router (end-to-end types, CiderPilot-style);
 * event endpoints stay on REST because photo-URL validation lives there.
 * Both surfaces throw ApiError so callers (useTrees) see one error shape.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: string[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Normalize tRPC client failures into the ApiError callers expect. */
function toApiError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const status =
      typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
    throw new ApiError(error.message, status);
  }
  throw error;
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // non-JSON error body
  }
  if (!response.ok) {
    const message =
      (typeof body.error === 'string' && body.error) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, body.errors as string[] | undefined);
  }
  return body as T;
}

export interface TreeCreateInput {
  orchard_id: string;
  row_id: string;
  /** Free-form alphanumeric label: "5", "1N", "A3", … */
  position: string;
  lat?: number;
  lng?: number;
  variety?: string;
  fruit_type?: string;
  status?: string;
  planted_date?: string;
  age?: number;
  height?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
  rootstock?: string;
  source?: string;
  acquired_date?: string;
}

export type TreeUpdateInput = Partial<Omit<TreeCreateInput, 'orchard_id'>>;

export async function fetchTrees(orchardId: string): Promise<ClientTree[]> {
  try {
    return (await trpc.tree.list.query({ orchardId })) as ClientTree[];
  } catch (error) {
    toApiError(error);
  }
}

export async function createTree(input: TreeCreateInput): Promise<ClientTree> {
  try {
    return (await trpc.tree.create.mutate(input)) as ClientTree;
  } catch (error) {
    toApiError(error);
  }
}

export async function updateTree(treeId: string, patch: TreeUpdateInput): Promise<ClientTree> {
  // superjson preserves undefined (unlike JSON.stringify) — drop those keys
  // so an untouched field never becomes an explicit SET col = NULL
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  try {
    return (await trpc.tree.update.mutate({ treeId, patch: cleaned })) as ClientTree;
  } catch (error) {
    toApiError(error);
  }
}

export async function deleteTree(treeId: string): Promise<void> {
  try {
    await trpc.tree.delete.mutate({ treeId });
  } catch (error) {
    toApiError(error);
  }
}

// ── Tree events (history log) ────────────────────────────────────────────

export interface ClientTreeEvent {
  id: number;
  tree_id: string;
  event_type: string;
  event_date: string | null;
  detail: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  photo_url: string | null;
  created_at: string | null;
}

export async function fetchTreeEvents(treeId: string): Promise<ClientTreeEvent[]> {
  const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}/events`);
  const body = await parseResponse<{ events: ClientTreeEvent[] }>(response);
  return body.events;
}

export async function createTreeEvent(
  treeId: string,
  input: {
    event_type: string;
    event_date?: string;
    detail?: string;
    changes?: Record<string, unknown>;
    photo_url?: string;
  }
): Promise<ClientTreeEvent[]> {
  const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await parseResponse<{ events: ClientTreeEvent[] }>(response);
  return body.events;
}
