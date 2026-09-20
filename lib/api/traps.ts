import { TRPCClientError } from '@trpc/client';
import { trpc } from '../trpc/client';
import type { TrapRow } from '../db/traps';
import type { TrapType } from '../traps';
import { ApiError } from './trees';

/**
 * Trap client for the map viewer. Same error contract as the tree and
 * area clients: everything throws ApiError.
 */

export { ApiError };
export type { TrapRow };

function toApiError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const status = typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
    throw new ApiError(error.message, status);
  }
  throw error;
}

export async function fetchTraps(orchardId: string, season: number): Promise<TrapRow[]> {
  try {
    return await trpc.trap.list.query({ orchardId, season });
  } catch (error) {
    toApiError(error);
  }
}

export async function createTrap(input: {
  orchardId: string;
  trapType: TrapType;
  label: string;
  locationNote?: string;
  lng: number;
  lat: number;
  deployedOn: string;
}): Promise<number> {
  try {
    const { id } = await trpc.trap.add.mutate(input);
    return id;
  } catch (error) {
    toApiError(error);
  }
}

export async function moveTrap(id: number, lng: number, lat: number): Promise<void> {
  try {
    await trpc.trap.move.mutate({ id, lng, lat });
  } catch (error) {
    toApiError(error);
  }
}

export async function recordTrapCount(
  orchardId: string,
  trapId: number,
  countedOn: string,
  count: number
): Promise<void> {
  try {
    await trpc.trap.recordCounts.mutate({
      orchardId,
      countedOn,
      entries: [{ trapId, count }],
    });
  } catch (error) {
    toApiError(error);
  }
}

export async function retireTrap(id: number, removedOn: string): Promise<void> {
  try {
    await trpc.trap.retire.mutate({ id, removedOn });
  } catch (error) {
    toApiError(error);
  }
}
