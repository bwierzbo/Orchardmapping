import { TRPCClientError } from '@trpc/client';
import { trpc } from '../trpc/client';
import type { ScheduleSummary } from '../db/schedule';
import { ApiError } from './trees';

/** Program client for the map viewer. Same error contract as the rest. */
export { ApiError };
export type { ScheduleSummary };

export async function fetchScheduleSummary(orchardId: string): Promise<ScheduleSummary> {
  try {
    return await trpc.program.summary.query({ orchardId });
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const status = typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
      throw new ApiError(error.message, status);
    }
    throw error;
  }
}
