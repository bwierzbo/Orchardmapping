import { TRPCClientError } from '@trpc/client';
import { trpc } from '../trpc/client';
import { ApiError } from './trees';
import type { Finding, ProgramMode, SprayMaterial } from '../spray-rules';

export { ApiError };

/** Same error contract as the tree/area clients: everything throws ApiError. */
function toApiError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const status = typeof error.data?.httpStatus === 'number' ? error.data.httpStatus : 500;
    throw new ApiError(error.message, status);
  }
  throw error;
}

export interface SprayApplicationView {
  id: number;
  material_name: string;
  material_key: string | null;
  applied_at: string;
  target: string | null;
  rate_value: number | null;
  rate_unit: string | null;
  area_description: string | null;
  applicator: string | null;
  notes: string | null;
}

export async function fetchMaterials(orchardId: string): Promise<{
  mode: ProgramMode;
  materials: SprayMaterial[];
}> {
  try {
    const r = await trpc.spray.materials.query({ orchardId });
    return { mode: r.mode as ProgramMode, materials: r.materials };
  } catch (error) {
    toApiError(error);
  }
}

export async function fetchRecommendations(
  orchardId: string,
  target: string,
): Promise<SprayMaterial[]> {
  try {
    const r = await trpc.spray.recommend.query({ orchardId, target });
    return r.options;
  } catch (error) {
    toApiError(error);
  }
}

export async function fetchApplications(
  orchardId: string,
): Promise<SprayApplicationView[]> {
  try {
    return (await trpc.spray.applications.query({ orchardId })) as SprayApplicationView[];
  } catch (error) {
    toApiError(error);
  }
}

export async function checkApplication(args: {
  orchardId: string;
  materialId: number;
  appliedAt: string;
}): Promise<{ findings: Finding[]; blocked: boolean }> {
  try {
    return await trpc.spray.check.query(args);
  } catch (error) {
    toApiError(error);
  }
}

export async function recordApplication(input: {
  orchardId: string;
  materialId: number;
  appliedAt: string;
  target?: string;
  rateValue?: number;
  rateUnit?: string;
  areaDescription?: string;
  applicator?: string;
  airTempF?: number;
  windMph?: number;
  notes?: string;
}): Promise<void> {
  try {
    await trpc.spray.record.mutate(input);
  } catch (error) {
    toApiError(error);
  }
}

export async function setProgramMode(
  orchardId: string,
  mode: ProgramMode,
): Promise<void> {
  try {
    await trpc.spray.setMode.mutate({ orchardId, mode });
  } catch (error) {
    toApiError(error);
  }
}

export async function removeApplication(id: number): Promise<void> {
  try {
    await trpc.spray.deleteApplication.mutate({ id });
  } catch (error) {
    toApiError(error);
  }
}
