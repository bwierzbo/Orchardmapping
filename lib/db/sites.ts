/**
 * Sites: a grower or operation, holding one or more orchards.
 *
 * A site's code and an orchard's code are permanent, because together
 * with the tree number they make up every tree id at that site
 * (OBC-001-0142). Nothing here may ever renumber an existing orchard --
 * that would orphan every id already printed, exported or linked to.
 */

const STOP_WORDS = new Set(['and', 'the', 'of', 'at', 'to', 'a', 'for']);
const CODE_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

/** The subset of a pg client these helpers need, so they join a transaction. */
type SqlClient = {
  query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * A short code from an operation's name: "Olympic Bluffs Cidery" -> OBC.
 * Falls back to the first three characters when a name yields too few
 * initials ("Manytrees" -> MAN). Matches what migration 049 did to the
 * orchards that existed before sites did.
 */
export function deriveSiteCode(name: string): string {
  // Apostrophes stay with their word, so "St. Mary's" is two words, not
  // three, and does not spend an initial on the possessive s.
  const cleaned = name.replace(/['\u2019]/g, '');
  const words = cleaned
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
  const initials = words.map((w) => w[0]!.toUpperCase()).join('');
  const base =
    initials.length >= 2
      ? initials.slice(0, 3)
      : cleaned.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  if (CODE_PATTERN.test(base)) return base;
  // A name that cannot make a legal code on its own -- starts with a
  // digit, or has no letters at all -- gets an S-prefixed one. Codes must
  // be 2-6 characters starting with a letter; freeSiteCode dedupes.
  const salvaged = ('S' + base.replace(/[^A-Z0-9]/g, '')).slice(0, 6);
  return salvaged.length >= 2 ? salvaged : 'SX';
}

/** The derived code, with a numeric suffix if another site already has it. */
async function freeSiteCode(client: SqlClient, name: string): Promise<string> {
  const base = deriveSiteCode(name);
  const { rows } = await client.query('SELECT code FROM sites WHERE code LIKE $1', [`${base}%`]);
  const taken = new Set(rows.map((r) => String(r.code)));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate) && CODE_PATTERN.test(candidate)) return candidate;
  }
  throw new Error(`Could not find a free site code near "${base}"`);
}

/** A slug that is not yet a site id. */
async function freeSiteId(client: SqlClient, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'site';
  const { rows } = await client.query('SELECT id FROM sites WHERE id LIKE $1', [`${base}%`]);
  const taken = new Set(rows.map((r) => String(r.id)));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  throw new Error(`Could not find a free site id near "${base}"`);
}

/**
 * Which site a person's new orchard belongs to.
 *
 * Someone who already works in exactly one site is adding to it -- that
 * is Olympic Bluffs gaining orchard 002. Anyone else (a new grower, or
 * someone who spans several sites and so cannot be guessed for) gets a
 * site of their own, named after the orchard they are creating.
 */
export async function resolveSiteForNewOrchard(
  client: SqlClient,
  ownerUserId: string,
  orchardName: string
): Promise<string> {
  const { rows } = await client.query(
    `SELECT DISTINCT o.site_id
       FROM orchard_members m
       JOIN orchards o ON o.id = m.orchard_id
      WHERE m.user_id = $1`,
    [ownerUserId]
  );
  if (rows.length === 1) return String(rows[0].site_id);

  const id = await freeSiteId(client, orchardName);
  const code = await freeSiteCode(client, orchardName);
  await client.query('INSERT INTO sites (id, code, name) VALUES ($1, $2, $3)', [
    id,
    code,
    orchardName,
  ]);
  return id;
}

/**
 * The next free ordinal within a site: 001, 002, 003.
 *
 * Counts up from the highest code ever used rather than filling gaps, so
 * a deleted orchard's number is never handed to a different one -- its
 * trees' ids would then read as belonging to the new orchard.
 */
export async function nextOrchardCode(client: SqlClient, siteId: string): Promise<string> {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) AS highest
       FROM orchards WHERE site_id = $1`,
    [siteId]
  );
  const next = Number(rows[0]?.highest ?? 0) + 1;
  return String(next).padStart(3, '0');
}
