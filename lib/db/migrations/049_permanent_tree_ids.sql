-- Permanent tree ids, and an address that is free to change.
--
-- Until now a tree's identity WAS its address: tree_id was generated as
-- `<orchard>-R<row>-P<position>`, so moving a tree meant renaming it, and
-- renaming it meant rewriting every row that referenced it by that bare
-- string (tree_events, pest_observations, the paused walk in app_settings).
-- That is why readdressTree had to be a transaction instead of a form
-- field, why two trees could not swap places in one step, and why
-- re-importing a renumbered CSV created duplicates instead of updating the
-- trees you already had.
--
-- After this migration:
--   * tree_id is permanent and opaque -- `OBC-001-0142` -- and is never
--     regenerated from anything. Site code, orchard code, tree number.
--   * block_id / row_id / position are ordinary nullable columns. A tree
--     may sit in a block with no row, a row with no block, or nowhere at
--     all (a newly discovered tree, which until now had to invent a fake
--     address like RFound-P09211423 just to be given an identity).
--   * two trees still cannot claim the same address within an orchard, but
--     the constraint is DEFERRABLE, so a swap or a shift-the-whole-row-by-one
--     succeeds inside one transaction instead of failing halfway through.
--
-- The middle part of the id names the planting a tree belongs to and is
-- permanent. It is NOT the block_id field, which is part of the mutable
-- address. The two are different things that both get called "block".

-- ---------------------------------------------------------------------------
-- 1. Sites: a grower or operation, above orchards.
-- ---------------------------------------------------------------------------
-- One site may hold several orchards (Olympic Bluffs Cidery -> 001, 002, 003),
-- each with its own imagery, boundary and tree numbering. Membership stays on
-- the orchard for now; lifting it to the site is a later decision.

CREATE TABLE IF NOT EXISTS sites (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9]{1,5}$'),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS site_id      TEXT REFERENCES sites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS code         TEXT,
  ADD COLUMN IF NOT EXISTS next_tree_no INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN orchards.code IS
  'Zero-padded ordinal within the site (001, 002). Permanent: it is baked into every tree id.';
COMMENT ON COLUMN orchards.next_tree_no IS
  'Next tree number to hand out. Only ever increases -- numbers are never reused.';

-- Every existing orchard becomes its own site, coded from its initials
-- ("Olympic Bluffs Cidery" -> OBC). A name that yields fewer than two
-- initials falls back to its first three characters; a collision gets a
-- numeric suffix.
WITH initials AS (
  SELECT o.id AS orchard_id,
         o.name,
         string_agg(upper(left(w, 1)), '' ORDER BY ord) AS letters
  FROM orchards o
  CROSS JOIN LATERAL unnest(
    regexp_split_to_array(regexp_replace(o.name, '[^A-Za-z0-9]+', ' ', 'g'), ' ')
  ) WITH ORDINALITY AS t(w, ord)
  WHERE w <> ''
    AND lower(w) NOT IN ('and', 'the', 'of', 'at', 'to', 'a', 'for')
  GROUP BY o.id, o.name
),
based AS (
  SELECT orchard_id,
         name,
         CASE
           WHEN length(letters) >= 2 THEN left(letters, 3)
           ELSE upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3))
         END AS base
  FROM initials
),
coded AS (
  SELECT orchard_id,
         name,
         base,
         row_number() OVER (PARTITION BY base ORDER BY orchard_id) AS dup
  FROM based
  WHERE base ~ '^[A-Z][A-Z0-9]{1,5}$'
)
INSERT INTO sites (id, code, name)
SELECT orchard_id,
       CASE WHEN dup = 1 THEN base ELSE base || dup::text END,
       name
FROM coded
ON CONFLICT (id) DO NOTHING;

-- Orchards with an unusable name fall back to a site keyed off their slug.
INSERT INTO sites (id, code, name)
SELECT o.id,
       'S' || upper(substr(md5(o.id), 1, 4)),
       o.name
FROM orchards o
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = o.id)
ON CONFLICT (id) DO NOTHING;

UPDATE orchards o
SET site_id = COALESCE(o.site_id, o.id),
    code    = COALESCE(o.code, lpad(r.n::text, 3, '0'))
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY COALESCE(site_id, id) ORDER BY id) AS n
  FROM orchards
) r
WHERE r.id = o.id;

ALTER TABLE orchards ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE orchards ALTER COLUMN code SET NOT NULL;

ALTER TABLE orchards DROP CONSTRAINT IF EXISTS orchards_site_code_uniq;
ALTER TABLE orchards ADD CONSTRAINT orchards_site_code_uniq UNIQUE (site_id, code);

-- ---------------------------------------------------------------------------
-- 2. Retire the dead tree_health_logs table.
-- ---------------------------------------------------------------------------
-- Written by nothing since migration 000 and empty. It also carries the only
-- real FK to trees(tree_id), with no ON UPDATE CASCADE -- which would reject
-- the id rewrite below the moment it ever held a row. Migration 006 said
-- "left in place; drop later". This is later.
DROP TABLE IF EXISTS tree_health_logs;

-- ---------------------------------------------------------------------------
-- 3. The address becomes ordinary, nullable, mutable data.
-- ---------------------------------------------------------------------------
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS tree_no        INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_tree_id TEXT;

COMMENT ON COLUMN trees.tree_no IS
  'Human-facing number within the orchard ("Tree 142"). Permanent; matches the tail of tree_id.';
COMMENT ON COLUMN trees.legacy_tree_id IS
  'The address-shaped id this tree carried before migration 049, so old links and exports still resolve.';

-- An absent address part is NULL, never the empty string, so "unplaced"
-- has exactly one representation.
UPDATE trees SET block_id = NULL WHERE block_id = '';
UPDATE trees SET row_id   = NULL WHERE row_id   = '';
UPDATE trees SET position = NULL WHERE position = '';

ALTER TABLE trees ADD COLUMN IF NOT EXISTS address_key TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN block_id IS NULL AND row_id IS NULL AND position IS NULL THEN NULL
      ELSE coalesce(block_id, '') || chr(31) || coalesce(row_id, '') || chr(31) || coalesce(position, '')
    END
  ) STORED;

COMMENT ON COLUMN trees.address_key IS
  'Derived from block/row/position so uniqueness can be enforced on the whole address. NULL when the tree is unplaced, which is why any number of unplaced trees may coexist.';

ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_orchard_row_pos_uniq;
ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_orchard_address_uniq;
ALTER TABLE trees ADD CONSTRAINT trees_orchard_address_uniq
  UNIQUE (orchard_id, address_key) DEFERRABLE INITIALLY IMMEDIATE;

-- ---------------------------------------------------------------------------
-- 4. Issue permanent ids, in walking order, and carry history across.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tree_id_map ON COMMIT DROP AS
SELECT t.tree_id AS old_id,
       t.orchard_id,
       n.seq AS tree_no,
       s.code || '-' || o.code || '-' || lpad(n.seq::text, 4, '0') AS new_id
FROM trees t
JOIN orchards o ON o.id = t.orchard_id
JOIN sites    s ON s.id = o.site_id
JOIN (
  SELECT tree_id,
         row_number() OVER (
           PARTITION BY orchard_id
           ORDER BY NULLIF(substring(row_id   FROM '^\d+'), '')::int NULLS LAST,
                    row_id,
                    NULLIF(substring(position FROM '^\d+'), '')::int NULLS LAST,
                    position,
                    id
         ) AS seq
  FROM trees
) n ON n.tree_id = t.tree_id;

CREATE UNIQUE INDEX ON tree_id_map (old_id);

UPDATE trees t
SET legacy_tree_id = COALESCE(t.legacy_tree_id, t.tree_id),
    tree_id        = m.new_id,
    tree_no        = m.tree_no
FROM tree_id_map m
WHERE t.tree_id = m.old_id;

UPDATE tree_events e
SET tree_id = m.new_id
FROM tree_id_map m
WHERE e.tree_id = m.old_id;

UPDATE pest_observations p
SET tree_id = m.new_id
FROM tree_id_map m
WHERE p.tree_id = m.old_id;

-- A paused walk holds tree ids in JSON; rewrite it rather than lose the walk.
-- jsonb_set with create_missing = false leaves a record alone if it has no
-- such key, so a half-written walk cannot be corrupted here.
UPDATE app_settings a
SET value = jsonb_set(a.value, '{pathIds}', (
      SELECT COALESCE(jsonb_agg(COALESCE(m.new_id, e.val) ORDER BY e.ord), '[]'::jsonb)
      FROM jsonb_array_elements_text(a.value->'pathIds') WITH ORDINALITY AS e(val, ord)
      LEFT JOIN tree_id_map m ON m.old_id = e.val
    ), false)
WHERE a.key LIKE 'walk_progress:%'
  AND jsonb_typeof(a.value->'pathIds') = 'array';

UPDATE app_settings a
SET value = jsonb_set(a.value, '{doneIds}', (
      SELECT COALESCE(jsonb_agg(COALESCE(m.new_id, e.val) ORDER BY e.ord), '[]'::jsonb)
      FROM jsonb_array_elements_text(a.value->'doneIds') WITH ORDINALITY AS e(val, ord)
      LEFT JOIN tree_id_map m ON m.old_id = e.val
    ), false)
WHERE a.key LIKE 'walk_progress:%'
  AND jsonb_typeof(a.value->'doneIds') = 'array';

UPDATE app_settings a
SET value = jsonb_set(a.value, '{currentId}', to_jsonb(m.new_id), false)
FROM tree_id_map m
WHERE a.key LIKE 'walk_progress:%'
  AND m.old_id = a.value->>'currentId';

UPDATE orchards o
SET next_tree_no = GREATEST(o.next_tree_no, COALESCE(m.max_no, 0) + 1)
FROM (SELECT orchard_id, max(tree_no) AS max_no FROM tree_id_map GROUP BY orchard_id) m
WHERE m.orchard_id = o.id;

ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_orchard_tree_no_uniq;
ALTER TABLE trees ADD CONSTRAINT trees_orchard_tree_no_uniq UNIQUE (orchard_id, tree_no);

CREATE INDEX IF NOT EXISTS idx_trees_legacy_tree_id ON trees (legacy_tree_id);
