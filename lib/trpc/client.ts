import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './router';

/**
 * Typed vanilla tRPC client. The viewer's optimistic-update logic lives
 * in useTrees, so a plain client (not the React hooks) is the right
 * shape — end-to-end types without re-architecting state.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
    }),
  ],
});
