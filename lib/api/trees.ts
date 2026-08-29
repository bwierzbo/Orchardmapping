import type { ClientTree } from '../types';

/**
 * Typed client for the tree API routes.
 *
 * Every mutation goes through here so the `{ success, tree }` response
 * envelope is unwrapped in exactly one place.
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
  position: number;
  lat?: number;
  lng?: number;
  variety?: string;
  status?: string;
  planted_date?: string;
  age?: number;
  height?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
}

export type TreeUpdateInput = Partial<Omit<TreeCreateInput, 'orchard_id'>>;

export async function fetchTrees(orchardId: string): Promise<ClientTree[]> {
  const response = await fetch(`/api/trees?orchard_id=${encodeURIComponent(orchardId)}`);
  const body = await parseResponse<{ trees: ClientTree[] }>(response);
  return body.trees;
}

export async function createTree(input: TreeCreateInput): Promise<ClientTree> {
  const response = await fetch('/api/trees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await parseResponse<{ tree: ClientTree }>(response);
  return body.tree;
}

export async function updateTree(treeId: string, patch: TreeUpdateInput): Promise<ClientTree> {
  const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await parseResponse<{ tree: ClientTree }>(response);
  return body.tree;
}

export async function deleteTree(treeId: string): Promise<void> {
  const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}`, {
    method: 'DELETE',
  });
  await parseResponse(response);
}
