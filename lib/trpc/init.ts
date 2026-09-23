import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@vercel/postgres';
import superjson from 'superjson';
import { orchardRole, roleAtLeast, isGlobalAdmin, type OrchardRole } from '@/lib/orchard-access';

/**
 * tRPC foundation, mirroring CiderPilot's packages/api/src/trpc.ts.
 *
 * Access model: an orchard is a tenant. `publicProcedure` means genuinely
 * public — reference data that belongs to nobody, like the variety and
 * pest libraries. Anything that names an orchard goes through an
 * orchard procedure, which checks membership and role.
 *
 * The orchard id arrives as untrusted input, so checking "is anyone
 * signed in" was never enough: it let any signed-in user read and write
 * any orchard in the database by naming it.
 */
export async function createTRPCContext() {
  const { userId } = await auth();
  return { userId: userId ?? null };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in.' });
  }
  return next({ ctx: { userId: ctx.userId } });
});

/**
 * The handful of people who run the whole system (migration 051).
 *
 * NOT_FOUND rather than FORBIDDEN on purpose: the access console should
 * not confirm its own existence to someone who may not use it.
 */
export const globalAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in.' });
  }
  if (!(await isGlobalAdmin(ctx.userId))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found.' });
  }
  return next({ ctx: { userId: ctx.userId } });
});

/**
 * Membership check for any procedure whose input names an orchard.
 *
 * Reads the raw input because the middleware runs before the procedure's
 * own zod parse; the id is re-validated by that parse afterwards. A
 * non-member gets NOT_FOUND rather than FORBIDDEN, since FORBIDDEN
 * confirms the orchard exists.
 */
function orchardAccess(required: OrchardRole) {
  return t.middleware(async ({ ctx, getRawInput, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in.' });
    }
    // Both spellings are in use across the router.
    const raw = (await getRawInput()) as
      | { orchardId?: unknown; orchard_id?: unknown }
      | null;
    const named = raw?.orchardId ?? raw?.orchard_id;
    const orchardId = typeof named === 'string' ? named : '';
    if (!orchardId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'orchardId is required.' });
    }
    const role = await orchardRole(orchardId, ctx.userId);
    if (!role) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found.' });
    }
    if (!roleAtLeast(role, required)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This needs ${required} access. You have ${role}.`,
      });
    }
    return next({ ctx: { userId: ctx.userId, role, orchardId } });
  });
}

/** Any member may read. */
export const orchardViewerProcedure = t.procedure.use(orchardAccess('viewer'));
/** Operators and admins may record work. */
export const orchardOperatorProcedure = t.procedure.use(orchardAccess('operator'));
/** Admins only: settings, membership, deletion. */
export const orchardAdminProcedure = t.procedure.use(orchardAccess('admin'));

/**
 * For procedures keyed by tree rather than orchard: resolve the tree's
 * orchard, then apply the same membership rule.
 */
function treeAccess(required: OrchardRole) {
  return t.middleware(async ({ ctx, getRawInput, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in.' });
    }
    const raw = (await getRawInput()) as { treeId?: unknown } | null;
    const treeId = typeof raw?.treeId === 'string' ? raw.treeId : '';
    if (!treeId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'treeId is required.' });
    }
    const { rows } = await sql`
      SELECT orchard_id FROM trees WHERE tree_id = ${treeId} LIMIT 1
    `;
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found.' });
    }
    const orchardId = String(rows[0].orchard_id);
    const role = await orchardRole(orchardId, ctx.userId);
    if (!role) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tree not found.' });
    }
    if (!roleAtLeast(role, required)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This needs ${required} access. You have ${role}.`,
      });
    }
    return next({ ctx: { userId: ctx.userId, role, orchardId } });
  });
}

export const treeViewerProcedure = t.procedure.use(treeAccess('viewer'));
export const treeOperatorProcedure = t.procedure.use(treeAccess('operator'));

/**
 * Tables whose rows belong to exactly one orchard and are addressed by a
 * numeric id. A fixed map, not a caller-supplied name: the table goes
 * into SQL that cannot be parameterised.
 */
const RECORD_TABLES = {
  area: 'orchard_areas',
  sprayApplication: 'spray_applications',
  pestObservation: 'pest_observations',
  phenologyMark: 'phenology_marks',
  trap: 'traps',
} as const;

export type RecordKind = keyof typeof RECORD_TABLES;

/**
 * Membership check for a mutation addressed by record id alone.
 *
 * These were the sharpest edge in the old model: delete-by-integer with
 * no orchard anywhere in the input, so any signed-in user could remove
 * another orchard's spray application by guessing a number. The owning
 * orchard is resolved from the row before the role is checked.
 */
function recordAccess(kind: RecordKind, required: OrchardRole) {
  const table = RECORD_TABLES[kind];
  return t.middleware(async ({ ctx, getRawInput, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in.' });
    }
    const raw = (await getRawInput()) as { id?: unknown } | null;
    const id = typeof raw?.id === 'number' ? raw.id : Number.NaN;
    if (!Number.isInteger(id)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'id is required.' });
    }
    const { rows } = await sql.query(
      `SELECT orchard_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found.' });
    }
    const orchardId = String(rows[0].orchard_id);
    const role = await orchardRole(orchardId, ctx.userId);
    if (!role) {
      // Same shape a missing row gives: never confirm someone else's record.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found.' });
    }
    if (!roleAtLeast(role, required)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This needs ${required} access. You have ${role}.`,
      });
    }
    return next({ ctx: { userId: ctx.userId, role, orchardId } });
  });
}

/** Operator access to a single record, resolved to its owning orchard. */
export const recordOperatorProcedure = (kind: RecordKind) =>
  t.procedure.use(recordAccess(kind, 'operator'));

/**
 * Does this orchard run that programme?
 *
 * Hiding the page is not a gate. Every button behind the program and
 * nutrition pages calls one of these procedures by name, and a signed-in
 * operator can call them whether or not the page rendered — so an
 * orchard whose owner has not taken on a spray programme could still
 * have steps written into it, applications recorded against it, and its
 * schedule read. The switch has to mean something on the server.
 *
 * Runs AFTER the access middleware, which has already resolved which
 * orchard this is — including the delete-by-record-id case, where the
 * orchard came from the row rather than the input.
 *
 * FORBIDDEN rather than NOT_FOUND: membership is already established by
 * this point, so there is nothing left to hide, and the caller deserves
 * to be told which switch to flip.
 */
function requireFeature(feature: 'ipm' | 'nutrition') {
  // One of two literals chosen here, never a caller's string: the column
  // name goes into SQL that cannot be parameterised.
  const column = feature === 'ipm' ? 'ipm_enabled' : 'nutrition_enabled';
  const label = feature === 'ipm' ? 'Pest management' : 'Nutrition';
  return t.middleware(async ({ ctx, next }) => {
    const orchardId = (ctx as { orchardId?: string }).orchardId;
    if (!orchardId) {
      // Only reachable by attaching this to a procedure that has not
      // resolved an orchard, which is a wiring mistake, not a caller's.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Feature check ran without an orchard.',
      });
    }
    const { rows } = await sql.query(
      `SELECT ${column} AS on FROM orchards WHERE id = $1 LIMIT 1`,
      [orchardId]
    );
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchard not found.' });
    }
    if (rows[0].on !== true) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${label} is switched off for this orchard. Turn it on from the dashboard first.`,
      });
    }
    return next();
  });
}

/** Read the programme, for an orchard that runs one. */
export const ipmViewerProcedure = orchardViewerProcedure.use(requireFeature('ipm'));
/** Record programme work: steps, applications, completions. */
export const ipmOperatorProcedure = orchardOperatorProcedure.use(requireFeature('ipm'));
/** Delete one programme record, resolved to its orchard by id. */
export const ipmRecordOperatorProcedure = (kind: RecordKind) =>
  recordOperatorProcedure(kind).use(requireFeature('ipm'));

/**
 * Nutrition has no read procedure — the page loads its tests on the
 * server — so only the write side exists here. Add a viewer variant when
 * something actually needs one.
 */
export const nutritionOperatorProcedure = orchardOperatorProcedure.use(
  requireFeature('nutrition')
);
/**
 * Accepting nutrient advice files it as a PROGRAM step, so it needs both
 * switches: the one that produced the advice and the one that owns the
 * place it lands. Without this, nutrition-on/IPM-off writes a step into
 * a programme nobody is running and nobody can see.
 */
export const nutritionIntoProgramProcedure = nutritionOperatorProcedure.use(
  requireFeature('ipm')
);
