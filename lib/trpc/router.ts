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
import { getAllOrchardConfigs, getOrchardConfigById } from '@/lib/db/orchards';
import {
  insertTreeEvent,
  listTreeEvents,
  MANUAL_EVENT_TYPES,
} from '@/lib/db/tree-events';
import { serializeTree } from '@/lib/serialize';
import { toYMD } from '@/lib/dates';
import { TRPCError } from '@trpc/server';
import { listAreas, insertArea, updateArea, deleteArea, AREA_KINDS } from '@/lib/db/areas';
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
});

export type AppRouter = typeof appRouter;
