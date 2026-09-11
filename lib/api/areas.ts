import { TRPCClientError } from '@trpc/client';
import { trpc } from '../trpc/client';
import type { OrchardArea, AreaKind } from '../db/areas';
import type { OrchardBoundary } from '../types';
import { ApiError } from './trees';

export { ApiError };
export type { OrchardArea, AreaKind };

/** Same error contract as the tree client: everything throws ApiError. */
function toApiError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const status = typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
    throw new ApiError(error.message, status);
  }
  throw error;
}

export async function fetchAreas(orchardId: string): Promise<OrchardArea[]> {
  try {
    return await trpc.area.list.query({ orchardId });
  } catch (error) {
    toApiError(error);
  }
}

export async function createArea(input: {
  orchardId: string;
  name: string;
  kind: AreaKind;
  polygon: OrchardBoundary;
  color?: string;
  notes?: string;
}): Promise<OrchardArea> {
  try {
    return await trpc.area.create.mutate(input);
  } catch (error) {
    toApiError(error);
  }
}

export async function updateArea(input: {
  id: number;
  name?: string;
  kind?: AreaKind;
  polygon?: OrchardBoundary;
  color?: string | null;
  notes?: string | null;
}): Promise<OrchardArea> {
  try {
    return await trpc.area.update.mutate(input);
  } catch (error) {
    toApiError(error);
  }
}

export async function deleteArea(id: number): Promise<void> {
  try {
    await trpc.area.delete.mutate({ id });
  } catch (error) {
    toApiError(error);
  }
}
