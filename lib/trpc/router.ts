import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from './init';
import {
  getTreesByOrchard,
  getTreeById,
  insertTree,
  updateTree,
  deleteTree,
  checkDuplicateRowPosition,
  TreeInsertData,
} from '@/lib/db/trees';
import { diffTreeChanges } from '@/lib/db/tree-events';
import {
  validateTreeRow,
  validateTreeUpdate,
  formatValidationErrors,
  TreeRowData,
} from '@/lib/tree-validation';
import {
  getAllOrchardConfigs,
  getOrchardConfigById,
  getOrchardById,
  updateOrchard,
} from '@/lib/db/orchards';
import { boundaryBounds } from '@/lib/orchard-boundary';
import {
  insertTreeEvent,
  listTreeEvents,
  MANUAL_EVENT_TYPES,
} from '@/lib/db/tree-events';
import { serializeTree } from '@/lib/serialize';
import { toYMD } from '@/lib/dates';
import { TRPCError } from '@trpc/server';
import { listAreas, insertArea, updateArea, deleteArea, AREA_KINDS } from '@/lib/db/areas';
import {
  listMaterials,
  getMaterial,
  getProgramMode,
  setProgramMode,
  listApplications,
  applicationHistory,
  insertApplication,
  deleteApplication,
} from '@/lib/db/spray';
import { listMarks, markStage, unmarkStage } from '@/lib/db/phenology';
import { completeStep, uncompleteStep } from '@/lib/db/program';
import { addTrap, listTraps, moveTrap, recordCount, retireTrap } from '@/lib/db/traps';
import { TRAP_TYPES } from '@/lib/traps';
import { PHENOLOGY_STAGES } from '@/lib/phenology';
import {
  listPests,
  getPest,
  listObservations,
  insertObservation,
  deleteObservation,
  observationCounts,
} from '@/lib/db/pests';
import {
  PROGRAM_MODES,
  evaluateApplication,
  availableMaterials,
  recommendFor,
  hasBlocker,
} from '@/lib/spray-rules';
import { parseBoundary } from '@/lib/orchard-boundary';

/**
 * App router — CiderPilot-style typed API surface. Reads are live here;
 * the REST routes remain the write path until the UI switches its
 * mutations over (tracked in the alignment plan).
 */
export const appRouter = router({
  orchard: router({
    list: publicProcedure.query(async () => getAllOrchardConfigs()),
    get: publicProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const config = await getOrchardConfigById(input.orchardId);
        if (!config) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found' });
        }
        return config;
      }),
    setBoundary: protectedProcedure
      .input(z.object({ orchardId: z.string().min(1), boundary: z.unknown() }))
      .mutation(async ({ input }) => {
        const boundary = parseBoundary(input.boundary);
        if (!boundary) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid boundary geometry' });
        }
        const orchard = await getOrchardById(input.orchardId);
        if (!orchard) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found' });
        }
        // Bounds only ever grow to cover the boundary (plus a margin) —
        // never shrink, so existing orthomosaic coverage stays reachable.
        const b = boundaryBounds(boundary);
        const marginLng = Math.max((b.maxLng - b.minLng) * 0.15, 0.0004);
        const marginLat = Math.max((b.maxLat - b.minLat) * 0.15, 0.0003);
        const updated = await updateOrchard(input.orchardId, {
          boundary_geojson: JSON.stringify(boundary),
          bounds_min_lng: Math.min(orchard.bounds_min_lng ?? Infinity, b.minLng - marginLng),
          bounds_min_lat: Math.min(orchard.bounds_min_lat ?? Infinity, b.minLat - marginLat),
          bounds_max_lng: Math.max(orchard.bounds_max_lng ?? -Infinity, b.maxLng + marginLng),
          bounds_max_lat: Math.max(orchard.bounds_max_lat ?? -Infinity, b.maxLat + marginLat),
        });
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found' });
        }
        return { success: true, boundary };
      }),
  }),

  tree: router({
    list: publicProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const trees = await getTreesByOrchard(input.orchardId);
        return trees.map(serializeTree);
      }),
    get: publicProcedure
      .input(z.object({ treeId: z.string().min(1) }))
      .query(async ({ input }) => {
        const tree = await getTreeById(input.treeId);
        if (!tree) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found' });
        }
        return serializeTree(tree);
      }),
    events: publicProcedure
      .input(z.object({ treeId: z.string().min(1) }))
      .query(async ({ input }) => {
        const events = await listTreeEvents(input.treeId);
        return events.map((e) => ({
          ...e,
          event_date: toYMD(e.event_date),
          created_at: e.created_at ? new Date(e.created_at).toISOString() : null,
        }));
      }),
    create: protectedProcedure
      .input(
        z.object({
          orchard_id: z.string().min(1),
          row_id: z.string().min(1),
          position: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
          lat: z.number().optional(),
          lng: z.number().optional(),
          variety: z.string().optional(),
          fruit_type: z.string().optional(),
          status: z.string().optional(),
          planted_date: z.string().optional(),
          age: z.number().optional(),
          height: z.number().optional(),
          last_pruned: z.string().optional(),
          last_harvest: z.string().optional(),
          yield_estimate: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Same shared validators as REST POST /api/trees — one rule set
        const validation = validateTreeRow(input as TreeRowData);
        if (!validation.isValid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: formatValidationErrors(validation.errors).join('; '),
          });
        }
        const duplicate = await checkDuplicateRowPosition(
          input.orchard_id,
          input.row_id,
          input.position
        );
        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A tree already exists at row ${input.row_id}, position ${input.position}`,
          });
        }
        const treeData: TreeInsertData = {
          ...input,
          // YYYY-MM-DD strings go to Postgres verbatim (never new Date())
          planted_date: input.planted_date || undefined,
          last_pruned: input.last_pruned || undefined,
          last_harvest: input.last_harvest || undefined,
        };
        const tree = await insertTree(treeData);
        await insertTreeEvent(
          {
            tree_id: tree.tree_id,
            orchard_id: tree.orchard_id,
            event_type: 'created',
            detail: `${tree.variety ?? 'Unknown variety'} at R${tree.row_id ?? '?'}·P${tree.position ?? '?'}`,
            created_by: ctx.userId,
          },
          { bestEffort: true }
        );
        return serializeTree(tree);
      }),
    update: protectedProcedure
      .input(
        z.object({
          treeId: z.string().min(1),
          patch: z.record(z.string(), z.unknown()),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Same flow as REST PUT /api/trees/[id]: strip protected fields,
        // shared validators, then the whitelisted updateTree
        const {
          id: _id,
          tree_id: _treeId,
          orchard_id: _orchardId,
          row_id: _rowId,
          position: _position,
          created_at: _createdAt,
          updated_at: _updatedAt,
          ...patch
        } = input.patch;
        const validation = validateTreeUpdate(patch as Partial<TreeRowData>);
        if (!validation.isValid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: formatValidationErrors(validation.errors).join('; '),
          });
        }
        if (Object.keys(patch).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid fields to update' });
        }
        const before = await getTreeById(input.treeId);
        const updated = await updateTree(input.treeId, patch);
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found' });
        }
        if (before) {
          const changes = diffTreeChanges(
            before as unknown as Record<string, unknown>,
            patch
          );
          if (Object.keys(changes).length > 0) {
            const eventType =
              'status' in changes && Object.keys(changes).length === 1
                ? 'status_change'
                : 'lat' in changes || 'lng' in changes
                  ? 'moved'
                  : 'updated';
            await insertTreeEvent(
              {
                tree_id: input.treeId,
                orchard_id: updated.orchard_id,
                event_type: eventType,
                changes,
                created_by: ctx.userId,
              },
              { bestEffort: true }
            );
          }
        }
        return serializeTree(updated);
      }),
    delete: protectedProcedure
      .input(z.object({ treeId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const before = await getTreeById(input.treeId);
        const deleted = await deleteTree(input.treeId);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found or already deleted' });
        }
        if (before) {
          await insertTreeEvent(
            {
              tree_id: input.treeId,
              orchard_id: before.orchard_id,
              event_type: 'deleted',
              detail: `${before.variety ?? 'Unknown variety'} at R${before.row_id ?? '?'}·P${before.position ?? '?'}`,
              changes: { snapshot: serializeTree(before) },
              created_by: ctx.userId,
            },
            { bestEffort: true }
          );
        }
        return { success: true };
      }),
    logEvent: protectedProcedure
      .input(
        z.object({
          treeId: z.string().min(1),
          eventType: z.enum(MANUAL_EVENT_TYPES),
          eventDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          detail: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tree = await getTreeById(input.treeId);
        if (!tree) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found' });
        }
        await insertTreeEvent({
          tree_id: input.treeId,
          orchard_id: tree.orchard_id,
          event_type: input.eventType,
          event_date: input.eventDate,
          detail: input.detail || undefined,
          created_by: ctx.userId,
        });
        return { success: true };
      }),
  }),

  area: router({
    list: publicProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => listAreas(input.orchardId)),
    create: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          name: z.string().trim().min(1).max(100),
          kind: z.enum(AREA_KINDS).default('area'),
          color: z.string().max(20).optional(),
          notes: z.string().max(2000).optional(),
          polygon: z.unknown(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const polygon = parseBoundary(input.polygon);
        if (!polygon) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid polygon geometry' });
        }
        return insertArea({
          orchard_id: input.orchardId,
          name: input.name,
          kind: input.kind,
          color: input.color,
          notes: input.notes,
          polygon,
          created_by: ctx.userId,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(100).optional(),
          kind: z.enum(AREA_KINDS).optional(),
          color: z.string().max(20).nullish(),
          notes: z.string().max(2000).nullish(),
          polygon: z.unknown().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, polygon: rawPolygon, ...rest } = input;
        const updates: Parameters<typeof updateArea>[1] = { ...rest };
        if (rawPolygon !== undefined) {
          const polygon = parseBoundary(rawPolygon);
          if (!polygon) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid polygon geometry' });
          }
          updates.polygon = polygon;
        }
        const area = await updateArea(id, updates);
        if (!area) throw new TRPCError({ code: 'NOT_FOUND', message: 'Area not found' });
        return area;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const deleted = await deleteArea(input.id);
        if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Area not found' });
        return { success: true };
      }),
  }),

  /**
   * Spray / IPM. The rules engine is the point: the same library reads
   * differently depending on the orchard's program mode, and an
   * application is checked against history before it is recorded.
   */
  spray: router({
    /** Library scoped to this orchard's program mode, plus the mode itself. */
    materials: publicProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const [library, mode] = await Promise.all([
          listMaterials(),
          getProgramMode(input.orchardId),
        ]);
        return { mode, materials: availableMaterials(library, mode), all: library };
      }),

    /** What to reach for against a target, best-fit first. */
    recommend: publicProcedure
      .input(z.object({ orchardId: z.string().min(1), target: z.string().min(1) }))
      .query(async ({ input }) => {
        const [library, mode] = await Promise.all([
          listMaterials(),
          getProgramMode(input.orchardId),
        ]);
        return { mode, options: recommendFor(library, input.target, mode) };
      }),

    applications: publicProcedure
      .input(z.object({ orchardId: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }))
      .query(async ({ input }) => listApplications(input.orchardId, input.limit ?? 100)),

    /** Dry run — what would this application trigger? Drives the live
     *  warnings in the form before anything is saved. */
    check: publicProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          materialId: z.number().int().positive(),
          appliedAt: z.string(),
        }),
      )
      .query(async ({ input }) => {
        const [material, mode, history, library] = await Promise.all([
          getMaterial(input.materialId),
          getProgramMode(input.orchardId),
          applicationHistory(input.orchardId),
          listMaterials(),
        ]);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        const findings = evaluateApplication({
          material,
          appliedAt: new Date(input.appliedAt),
          mode,
          history,
          library,
        });
        return { findings, blocked: hasBlocker(findings) };
      }),

    record: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          materialId: z.number().int().positive(),
          appliedAt: z.string(),
          target: z.string().max(120).optional(),
          rateValue: z.number().nonnegative().optional(),
          rateUnit: z.string().max(40).optional(),
          areaDescription: z.string().max(240).optional(),
          applicator: z.string().max(120).optional(),
          applicatorLicense: z.string().max(60).optional(),
          airTempF: z.number().optional(),
          windMph: z.number().nonnegative().optional(),
          conditions: z.string().max(240).optional(),
          notes: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const [material, mode, history, library] = await Promise.all([
          getMaterial(input.materialId),
          getProgramMode(input.orchardId),
          applicationHistory(input.orchardId),
          listMaterials(),
        ]);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        const findings = evaluateApplication({
          material,
          appliedAt: new Date(input.appliedAt),
          mode,
          history,
          library,
        });
        // Certified-organic compliance is the one hard stop; everything
        // else is the operator's call and is recorded with the warning.
        if (hasBlocker(findings)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: findings.find((f) => f.level === 'blocked')!.message,
          });
        }
        const application = await insertApplication({
          ...input,
          createdBy: ctx.userId ?? null,
        });
        return { application, findings };
      }),

    setMode: protectedProcedure
      .input(z.object({ orchardId: z.string().min(1), mode: z.enum(PROGRAM_MODES) }))
      .mutation(async ({ input }) => {
        await setProgramMode(input.orchardId, input.mode);
        return { success: true, mode: input.mode };
      }),

    deleteApplication: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const ok = await deleteApplication(input.id);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });
        return { success: true };
      }),
  }),

  /**
   * Pest & disease library. Entry keys are the same keys the material
   * library targets, so an entry can answer "what treats this?" through
   * spray.recommend without a second mapping.
   */
  pest: router({
    list: publicProcedure
      .input(z.object({ orchardId: z.string().min(1).optional() }).optional())
      .query(async ({ input }) => {
        const entries = await listPests();
        const counts = input?.orchardId
          ? await observationCounts(input.orchardId)
          : {};
        return { entries, counts };
      }),

    get: publicProcedure
      .input(z.object({ key: z.string().min(1), orchardId: z.string().min(1).optional() }))
      .query(async ({ input }) => {
        const entry = await getPest(input.key);
        if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
        const observations = input.orchardId
          ? await listObservations(input.orchardId, input.key)
          : [];
        return { entry, observations };
      }),

    observations: publicProcedure
      .input(z.object({ orchardId: z.string().min(1), pestKey: z.string().optional() }))
      .query(async ({ input }) => listObservations(input.orchardId, input.pestKey)),

    /** Log a sighting — this is both the scouting record and the photo
     *  that grows the orchard's own reference collection. */
    observe: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          pestKey: z.string().min(1),
          treeId: z.string().optional(),
          photoUrl: z.string().url().optional(),
          severity: z.enum(['light', 'moderate', 'severe']).optional(),
          observedAt: z.string().optional(),
          notes: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) =>
        insertObservation({ ...input, createdBy: ctx.userId ?? null }),
      ),

    deleteObservation: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const ok = await deleteObservation(input.id);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
        return { success: true };
      }),
  }),

  /**
   * Growth stages. Stage-anchored spray timing ("copper at half-inch
   * green") can only be placed on a calendar once the orchard records
   * when it actually got there.
   */
  phenology: router({
    list: publicProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => listMarks(input.orchardId)),

    mark: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stage: z.enum(PHENOLOGY_STAGES),
          // Plain YYYY-MM-DD: passes to Postgres verbatim, no day-shift
          observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => markStage({ ...input, createdBy: ctx.userId })),

    unmark: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const ok = await unmarkStage(input.id);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mark not found' });
        return { success: true };
      }),
  }),

  /**
   * Program step completions — the work that isn't a spray. A recorded
   * spray completes its own step through the application history, so
   * nothing here duplicates the spray page.
   */
  program: router({
    complete: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stepKey: z.string().min(1),
          completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => completeStep({ ...input, createdBy: ctx.userId })),

    uncomplete: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stepKey: z.string().min(1),
          completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .mutation(async ({ input }) => {
        const ok = await uncompleteStep(input.orchardId, input.stepKey, input.completedOn);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Completion not found' });
        return { success: true };
      }),
  }),

  /**
   * Monitoring traps. A count is what turns a threshold step in the
   * program from a standing watch into a job, so this is the entry
   * point for the summer half of the year.
   */
  trap: router({
    list: publicProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          season: z.number().int().min(2000).max(2100).optional(),
        }),
      )
      .query(async ({ input }) =>
        listTraps(input.orchardId, input.season ?? new Date().getFullYear()),
      ),

    add: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          trapType: z.enum(TRAP_TYPES),
          label: z.string().min(1).max(80),
          locationNote: z.string().max(200).optional(),
          lng: z.number().min(-180).max(180).optional(),
          lat: z.number().min(-90).max(90).optional(),
          deployedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const id = await addTrap({ ...input, createdBy: ctx.userId });
        return { id };
      }),

    /** Place a trap on the map, or drag one already there. */
    move: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          lng: z.number().min(-180).max(180),
          lat: z.number().min(-90).max(90),
        }),
      )
      .mutation(async ({ input }) => {
        const ok = await moveTrap(input.id, input.lng, input.lat);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trap not found' });
        return { success: true };
      }),

    retire: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          removedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .mutation(async ({ input }) => {
        const ok = await retireTrap(input.id, input.removedOn);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trap not found or already down' });
        return { success: true };
      }),

    /** The weekly round arrives as one submission, not one per trap. */
    recordCounts: protectedProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          countedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          entries: z
            .array(
              z.object({
                trapId: z.number().int().positive(),
                count: z.number().int().min(0).max(10_000),
              }),
            )
            .min(1)
            .max(100),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        for (const e of input.entries) {
          await recordCount({
            trapId: e.trapId,
            countedOn: input.countedOn,
            count: e.count,
            createdBy: ctx.userId,
          });
        }
        return { recorded: input.entries.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
