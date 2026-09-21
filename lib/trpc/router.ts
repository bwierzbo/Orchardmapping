import { z } from 'zod';
import {
  router,
  publicProcedure,
  protectedProcedure,
  orchardViewerProcedure,
  orchardOperatorProcedure,
  orchardAdminProcedure,
  treeViewerProcedure,
  treeOperatorProcedure,
  recordOperatorProcedure,
  globalAdminProcedure,
} from './init';
import { memberOrchardConfigs, roleAtLeast, ORCHARD_ROLES } from '@/lib/orchard-access';
import {
  listMembers,
  listPendingInvitations,
  inviteMember,
  revokeInvitation,
  setMemberRole,
  removeMember,
} from '@/lib/db/members';
import {
  getTreesByOrchard,
  getTreeById,
  insertTree,
  updateTree,
  deleteTree,

  TreeInsertData,
  setTreeAddress,
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
import { formatAddress } from '@/lib/address';
import { applyTreeEdits } from '@/lib/db/group-actions';
import { listPeople, setGlobalRole } from '@/lib/db/people';
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
import {
  listMarks,
  listVarieties,
  markStage,
  markStageForAll,
  unmarkStage,
} from '@/lib/db/phenology';
import { PHENOLOGY_SCOPES } from '@/lib/phenology';
import { clearPosture, setPosture } from '@/lib/db/posture';
import { POSTURES } from '@/lib/posture';
import { completeStep, setStepEnabled, uncompleteStep } from '@/lib/db/program';
import { summariseSchedule } from '@/lib/db/schedule';
import { recordTissueTest, recordSoilTest, setOrchardIntent } from '@/lib/db/nutrition';
import { FRUIT_PURPOSES, NUTRIENTS, OPERATION_SCALES } from '@/lib/nutrition';
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
    // Only the orchards you belong to. This returned every orchard in the
    // database, which is how one signed-in user found everyone else's.
    list: protectedProcedure.query(async ({ ctx }) => {
      return memberOrchardConfigs(ctx.userId);
    }),
    get: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const config = await getOrchardConfigById(input.orchardId);
        if (!config) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found' });
        }
        return config;
      }),
    setBoundary: orchardOperatorProcedure
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
    list: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const trees = await getTreesByOrchard(input.orchardId);
        return trees.map(serializeTree);
      }),
    get: treeViewerProcedure
      .input(z.object({ treeId: z.string().min(1) }))
      .query(async ({ input }) => {
        const tree = await getTreeById(input.treeId);
        if (!tree) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found' });
        }
        return serializeTree(tree);
      }),
    events: treeViewerProcedure
      .input(z.object({ treeId: z.string().min(1) }))
      .query(async ({ input }) => {
        const events = await listTreeEvents(input.treeId);
        return events.map((e) => ({
          ...e,
          event_date: toYMD(e.event_date),
          created_at: e.created_at ? new Date(e.created_at).toISOString() : null,
        }));
      }),
    create: orchardOperatorProcedure
      .input(
        z.object({
          orchard_id: z.string().min(1),
          // The address is optional: a tree can be recorded where it
          // stands and placed in a row later.
          block_id: z.string().max(50).optional(),
          row_id: z.string().max(50).optional(),
          position: z
            .union([z.string(), z.number()])
            .transform((v) => String(v).trim())
            .optional(),
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
            detail: `${tree.variety ?? 'Unknown variety'} at ${formatAddress(tree)}`,
            created_by: ctx.userId,
          },
          { bestEffort: true }
        );
        return serializeTree(tree);
      }),
    update: treeOperatorProcedure
      .input(
        z.object({
          treeId: z.string().min(1),
          patch: z.record(z.string(), z.unknown()),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Same flow as REST PUT /api/trees/[id]: strip the fields that are
        // not field edits, shared validators, then the whitelisted
        // updateTree. The address goes through tree.setAddress, which
        // checks for a collision and logs the move.
        const {
          id: _id,
          tree_id: _treeId,
          tree_no: _treeNo,
          legacy_tree_id: _legacyTreeId,
          orchard_id: _orchardId,
          block_id: _blockId,
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
    delete: treeOperatorProcedure
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
              detail: `${before.variety ?? 'Unknown variety'} at ${formatAddress(before)}`,
              changes: { snapshot: serializeTree(before) },
              created_by: ctx.userId,
            },
            { bestEffort: true }
          );
        }
        return { success: true };
      }),
    /**
     * Move a tree to a different block, row and position.
     *
     * Separate from `update` so there is one place that checks for a
     * collision, defers the address constraint (which is what lets two
     * trees swap in one step) and logs the move to the tree's history.
     * An omitted part clears it: a tree can be taken out of its row.
     */
    setAddress: treeOperatorProcedure
      .input(
        z.object({
          treeId: z.string().min(1),
          blockId: z.string().trim().max(50).nullish(),
          rowId: z.string().trim().max(50).nullish(),
          position: z.string().trim().max(50).nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const r = await setTreeAddress(
          input.treeId,
          { block_id: input.blockId, row_id: input.rowId, position: input.position },
          { actor: ctx.userId }
        );
        if (!r.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: r.reason });
        return r;
      }),

    /**
     * Save a grid of per-tree edits as one action.
     *
     * Different trees get different values, which neither group actions
     * (one field, one value, whole filter) nor the bulk import (matched
     * by address, no history) could express. Lands as a single entry in
     * the activity list, a diff on each tree's own history, and one undo.
     */
    editMany: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          edits: z
            .array(
              z.object({
                treeId: z.string().min(1),
                fields: z.record(z.string(), z.string().nullable()),
              })
            )
            .min(1)
            .max(5000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Same field rules the single-tree editor uses
        for (const edit of input.edits) {
          const validation = validateTreeUpdate(edit.fields as Partial<TreeRowData>);
          if (!validation.isValid) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: formatValidationErrors(validation.errors).join('; '),
            });
          }
        }
        try {
          return await applyTreeEdits(input.orchardId, input.edits, ctx.userId);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 409) {
            throw new TRPCError({ code: 'CONFLICT', message: (error as Error).message });
          }
          if (status === 400) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
          }
          throw error;
        }
      }),

    logEvent: treeOperatorProcedure
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
    list: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => listAreas(input.orchardId)),
    create: orchardOperatorProcedure
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
    update: recordOperatorProcedure('area')
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
    delete: recordOperatorProcedure('area')
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
    materials: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => {
        const [library, mode] = await Promise.all([
          listMaterials(),
          getProgramMode(input.orchardId),
        ]);
        return { mode, materials: availableMaterials(library, mode), all: library };
      }),

    /** What to reach for against a target, best-fit first. */
    recommend: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1), target: z.string().min(1) }))
      .query(async ({ input }) => {
        const [library, mode] = await Promise.all([
          listMaterials(),
          getProgramMode(input.orchardId),
        ]);
        return { mode, options: recommendFor(library, input.target, mode) };
      }),

    applications: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }))
      .query(async ({ input }) => listApplications(input.orchardId, input.limit ?? 100)),

    /** Dry run — what would this application trigger? Drives the live
     *  warnings in the form before anything is saved. */
    check: orchardViewerProcedure
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

    record: orchardOperatorProcedure
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

    setMode: orchardOperatorProcedure
      .input(z.object({ orchardId: z.string().min(1), mode: z.enum(PROGRAM_MODES) }))
      .mutation(async ({ input }) => {
        await setProgramMode(input.orchardId, input.mode);
        return { success: true, mode: input.mode };
      }),

    deleteApplication: recordOperatorProcedure('sprayApplication')
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
    list: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1).optional() }).optional())
      .query(async ({ input }) => {
        const entries = await listPests();
        const counts = input?.orchardId
          ? await observationCounts(input.orchardId)
          : {};
        return { entries, counts };
      }),

    get: orchardViewerProcedure
      .input(z.object({ key: z.string().min(1), orchardId: z.string().min(1).optional() }))
      .query(async ({ input }) => {
        const entry = await getPest(input.key);
        if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
        const observations = input.orchardId
          ? await listObservations(input.orchardId, input.key)
          : [];
        return { entry, observations };
      }),

    observations: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1), pestKey: z.string().optional() }))
      .query(async ({ input }) => listObservations(input.orchardId, input.pestKey)),

    /** Log a sighting — this is both the scouting record and the photo
     *  that grows the orchard's own reference collection. */
    observe: treeOperatorProcedure
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

    deleteObservation: recordOperatorProcedure('pestObservation')
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const ok = await deleteObservation(input.id);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
        return { success: true };
      }),

    /**
     * What this orchard is doing about a pest. 'off' is a decision, and
     * recording it is what stops the coverage check treating the pest
     * as an oversight.
     */
    setPosture: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          pestKey: z.string().min(1),
          posture: z.enum(POSTURES),
          minSeverity: z.enum(['light', 'moderate', 'severe']).optional(),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await setPosture({ ...input, updatedBy: ctx.userId });
        return { success: true };
      }),

    clearPosture: orchardOperatorProcedure
      .input(z.object({ orchardId: z.string().min(1), pestKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await clearPosture(input.orchardId, input.pestKey);
        return { success: true };
      }),
  }),

  /**
   * Growth stages. Stage-anchored spray timing ("copper at half-inch
   * green") can only be placed on a calendar once the orchard records
   * when it actually got there.
   */
  phenology: router({
    list: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => listMarks(input.orchardId)),

    varieties: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => listVarieties(input.orchardId)),

    /**
     * Mark a stage for everything, naming only the stragglers. With a
     * block of eighteen varieties arriving within a few days, the
     * exceptions are the short list and the rest is one tap.
     */
    markAll: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stage: z.enum(PHENOLOGY_STAGES),
          observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          groups: z.array(z.string().min(1)).min(1).max(200),
          exceptions: z
            .array(
              z.object({
                group: z.string().min(1),
                // null means "not there yet" — skipped, not guessed
                observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
              }),
            )
            .max(200)
            .optional(),
          scope: z.enum(PHENOLOGY_SCOPES).optional(),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const marked = await markStageForAll({ ...input, createdBy: ctx.userId });
        return { marked };
      }),

    mark: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stage: z.enum(PHENOLOGY_STAGES),
          // Plain YYYY-MM-DD: passes to Postgres verbatim, no day-shift
          observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          scope: z.enum(PHENOLOGY_SCOPES).optional(),
          scopeValue: z.string().max(120).nullable().optional(),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => markStage({ ...input, createdBy: ctx.userId })),

    unmark: recordOperatorProcedure('phenologyMark')
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
    /** What the program is asking for, small enough for the map. */
    summary: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input }) => summariseSchedule(input.orchardId)),

    /** Turn a step on or off for this orchard. Global steps are regional
     *  agronomy; whether an orchard runs one is a local decision. */
    setEnabled: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stepKey: z.string().min(1),
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ input }) => {
        await setStepEnabled(input.orchardId, input.stepKey, input.enabled);
        return { success: true };
      }),

    complete: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          stepKey: z.string().min(1),
          completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          note: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => completeStep({ ...input, createdBy: ctx.userId })),

    uncomplete: orchardOperatorProcedure
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
   * Nutrition: what the orchard is for, and what the lab said.
   *
   * The sufficiency ranges do not vary by intent — WSU is explicit that
   * they hold irrespective of cultivar and system. Intent changes what
   * a reading means, which is interpretation and lives in lib.
   */
  nutrition: router({
    setIntent: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          fruitPurpose: z.enum(FRUIT_PURPOSES).optional(),
          operationScale: z.enum(OPERATION_SCALES).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await setOrchardIntent(input.orchardId, input);
        return { success: true };
      }),

    recordTissue: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          sampledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          sampleArea: z.string().max(200).optional(),
          lab: z.string().max(120).optional(),
          // Every nutrient optional: labs run different panels, and a
          // missing value means unmeasured rather than zero.
          values: z.record(z.enum(NUTRIENTS), z.number().min(0).max(100_000).optional()),
          notes: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const id = await recordTissueTest({ ...input, createdBy: ctx.userId });
        return { id };
      }),

    recordSoil: orchardOperatorProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          sampledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          sampleArea: z.string().max(200).optional(),
          lab: z.string().max(120).optional(),
          ph: z.number().min(0).max(14).optional(),
          organicMatterPct: z.number().min(0).max(100).optional(),
          cec: z.number().min(0).max(1000).optional(),
          values: z
            .record(z.enum(['p', 'k', 'ca', 'mg', 'b', 'zn', 'mn', 'cu']), z.number().min(0).optional())
            .optional(),
          notes: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const id = await recordSoilTest({ ...input, createdBy: ctx.userId });
        return { id };
      }),
  }),

  /**
   * Monitoring traps. A count is what turns a threshold step in the
   * program from a standing watch into a job, so this is the entry
   * point for the summer half of the year.
   */
  trap: router({
    list: orchardViewerProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          season: z.number().int().min(2000).max(2100).optional(),
        }),
      )
      .query(async ({ input }) =>
        listTraps(input.orchardId, input.season ?? new Date().getFullYear()),
      ),

    add: orchardOperatorProcedure
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
    move: recordOperatorProcedure('trap')
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

    retire: recordOperatorProcedure('trap')
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
    recordCounts: orchardOperatorProcedure
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

  /**
   * Who may reach this orchard. Everything here is admin-only except the
   * listing, which any member may see — knowing who else can change your
   * records is not privileged information.
   */
  /**
   * System-wide access. Only global admins may look, which is why the
   * gate answers NOT_FOUND rather than FORBIDDEN.
   */
  access: router({
    people: globalAdminProcedure.query(async () => ({
      people: await listPeople(),
      orchards: await getAllOrchardConfigs().then((all) =>
        all.map((o) => ({ id: o.id, name: o.name }))
      ),
    })),

    setGlobalRole: globalAdminProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          // null clears it, leaving whatever memberships they hold
          role: z.enum(ORCHARD_ROLES).nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await setGlobalRole(input.userId, input.role, ctx.userId);
        } catch (error) {
          // setGlobalRole refuses to strand the system without an admin
          if ((error as { status?: number }).status === 400) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
          }
          throw error;
        }
        return { ok: true };
      }),
  }),

  members: router({
    list: orchardViewerProcedure
      .input(z.object({ orchardId: z.string().min(1) }))
      .query(async ({ input, ctx }) => ({
        members: await listMembers(input.orchardId),
        pending: roleAtLeast(ctx.role, 'admin')
          ? await listPendingInvitations(input.orchardId)
          : [],
        yourRole: ctx.role,
      })),

    invite: orchardAdminProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          email: z.string().trim().email(),
          role: z.enum(ORCHARD_ROLES),
        })
      )
      .mutation(({ input, ctx }) =>
        inviteMember(input.orchardId, input.email, input.role, ctx.userId)
      ),

    revokeInvitation: orchardAdminProcedure
      .input(z.object({ orchardId: z.string().min(1), id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const ok = await revokeInvitation(input.orchardId, input.id);
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
        return { success: true };
      }),

    setRole: orchardAdminProcedure
      .input(
        z.object({
          orchardId: z.string().min(1),
          userId: z.string().min(1),
          role: z.enum(ORCHARD_ROLES),
        })
      )
      .mutation(async ({ input }) => {
        const r = await setMemberRole(input.orchardId, input.userId, input.role);
        if (!r.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: r.reason });
        return { success: true };
      }),

    remove: orchardAdminProcedure
      .input(z.object({ orchardId: z.string().min(1), userId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const r = await removeMember(input.orchardId, input.userId);
        if (!r.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: r.reason });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
