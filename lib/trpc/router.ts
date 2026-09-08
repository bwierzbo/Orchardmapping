import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from './init';
import { getTreesByOrchard, getTreeById } from '@/lib/db/trees';
import { getAllOrchardConfigs, getOrchardConfigById } from '@/lib/db/orchards';
import {
  insertTreeEvent,
  listTreeEvents,
  MANUAL_EVENT_TYPES,
} from '@/lib/db/tree-events';
import { serializeTree } from '@/lib/serialize';
import { toYMD } from '@/lib/dates';
import { TRPCError } from '@trpc/server';

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
});

export type AppRouter = typeof appRouter;
