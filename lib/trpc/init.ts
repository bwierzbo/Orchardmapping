import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@clerk/nextjs/server';
import superjson from 'superjson';

/**
 * tRPC foundation, mirroring CiderPilot's packages/api/src/trpc.ts:
 * a public procedure for reads and a protectedProcedure for mutations.
 * Access model matches lib/api-auth.ts — the Clerk instance is
 * invite-only, so any signed-in user is a trusted collaborator.
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
