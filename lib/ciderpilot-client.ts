/**
 * Calling CiderPilot from the server.
 *
 * One cidery for now, so the connection is two environment variables and
 * the token is never in the database or the browser:
 *   CIDERPILOT_URL    https://… of the cidery's CiderPilot
 *   CIDERPILOT_TOKEN  an integration token made there (starts cpi_)
 * Unset means the link is simply not offered.
 *
 * CiderPilot's API is tRPC over HTTP with no transformer: a query is a GET
 * with ?input=, a mutation a POST of the input, and the answer is
 * { result: { data } } or { error: { message, data: { code } } }.
 */

/** A failure CiderPilot reported, or a failure to reach it. */
export class CiderPilotError extends Error {
  constructor(
    message: string,
    /** tRPC's code where the cidery answered: UNAUTHORIZED, NOT_FOUND, … */
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'CiderPilotError';
  }
}

interface Connection {
  url: string;
  token: string;
}

/** The connection, or null when this deployment has none. */
export function ciderpilotConnection(
  env: Record<string, string | undefined> = process.env,
): Connection | null {
  const url = env.CIDERPILOT_URL?.trim().replace(/\/+$/, '');
  const token = env.CIDERPILOT_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** How long one call may take before it is given up on. */
const TIMEOUT_MS = 15_000;

/**
 * Call one procedure. Throws CiderPilotError for anything but an answer:
 * not configured, unreachable, timed out, or refused.
 */
export async function callCiderPilot<T>(
  procedure: string,
  kind: 'query' | 'mutation',
  input?: unknown,
): Promise<T> {
  const connection = ciderpilotConnection();
  if (!connection) throw new CiderPilotError('CiderPilot is not connected', null);

  const base = `${connection.url}/api/trpc/${procedure}`;
  const headers = { Authorization: `Bearer ${connection.token}` };
  let response: Response;
  try {
    response =
      kind === 'query'
        ? await fetch(
            input === undefined ? base : `${base}?input=${encodeURIComponent(JSON.stringify(input))}`,
            { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' },
          )
        : await fetch(base, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(input ?? {}),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
          });
  } catch {
    throw new CiderPilotError('CiderPilot could not be reached', null);
  }

  const body = (await response.json().catch(() => null)) as
    | { result?: { data?: T }; error?: { message?: string; data?: { code?: string } } }
    | null;
  if (!response.ok || !body || body.error || !body.result) {
    throw new CiderPilotError(
      body?.error?.message ?? `CiderPilot answered ${response.status}`,
      body?.error?.data?.code ?? null,
    );
  }
  return body.result.data as T;
}
