import { NextResponse } from 'next/server';
import { UnknownColumnError } from './db/sql-helpers';

/**
 * Central API error responder.
 *
 * Logs the full error server-side and returns a generic message to the
 * client — error internals (constraint names, SQL text, connection info)
 * must never reach unauthenticated callers.
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof UnknownColumnError) {
    return NextResponse.json(
      { error: `Unknown field(s): ${error.columns.join(', ')}` },
      { status: 400 }
    );
  }

  // A deliberate refusal (a missing row, a request that cannot be honoured)
  // carries its own status and a message written for the user.
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status });
  }

  console.error(`[api] ${context}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
