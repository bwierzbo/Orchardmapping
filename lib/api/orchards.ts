import { TRPCClientError } from '@trpc/client';
import { trpc } from '../trpc/client';
import type { OrchardBoundary } from '../types';
import { ApiError } from './trees';

/** Same error contract as the tree client: everything throws ApiError. */
function toApiError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const status = typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
    throw new ApiError(error.message, status);
  }
  throw error;
}

export async function saveOrchardBoundary(
  orchardId: string,
  boundary: OrchardBoundary
): Promise<OrchardBoundary> {
  try {
    const result = await trpc.orchard.setBoundary.mutate({ orchardId, boundary });
    return result.boundary;
  } catch (error) {
    toApiError(error);
  }
}
