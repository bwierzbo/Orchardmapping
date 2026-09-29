-- Row labels that were standing in for something else.
--
-- Until the add-trees panel gained a block field, the only address boxes
-- were a row and a position, so anything that was not a numbered row had to
-- be written into the row. Four labels came out of that, and each means
-- something different.
--
--   'Berries 1' / 'Berries 2'  two rows of the berry patch at Farm House.
--                              The grower calls them north and south.
--   'Rx'                       the espalier row at Farm House, which runs
--                              perpendicular to the rest.
--   'Scan'                     not a place at all. The tree-detection pass
--                              hardcoded it as the row for everything it
--                              found, so 31 trees at Prairie Pride are
--                              filed in a row that does not exist.
--
-- The first three are renames. The fourth is a deletion, and the thing
-- worth keeping is not the label but the fact behind it: these trees were
-- found by machine from imagery, never confirmed on the ground, and still
-- carry no variety and a status of unknown. `source` cannot hold that --
-- it means the nursery a tree was bought from ('Cummins Nursery', 'Trees
-- of Antiquity') and writing 'detected' there would corrupt a column that
-- means something else. So it goes in notes, and the row is cleared.
--
-- Scoped by orchard on purpose: 'Berries 1' is a Farm House label, and a
-- blanket rename would reach into any orchard that later uses the words.

UPDATE trees t
SET row_id = CASE btrim(t.row_id)
               WHEN 'Berries 1' THEN 'Berries North'
               WHEN 'Berries 2' THEN 'Berries South'
               WHEN 'Rx'        THEN 'Espalier'
             END
FROM orchards o
WHERE o.id = t.orchard_id
  AND o.name = 'Farm House Orchard'
  AND btrim(t.row_id) IN ('Berries 1', 'Berries 2', 'Rx');

-- Keep the provenance, then drop the label. Idempotent: a re-run finds no
-- rows left in the 'Scan' row.
UPDATE trees
SET notes = concat_ws(
      ' ',
      nullif(btrim(COALESCE(notes, '')), ''),
      '[Found by tree detection on ' || to_char(created_at, 'YYYY-MM-DD')
      || '; position never confirmed on the ground.]'
    ),
    row_id = NULL
WHERE btrim(COALESCE(row_id, '')) = 'Scan';
