-- One tree in a row called "a".
--
-- TA-002-0001 sits at South · a · 1 in Ethel's Orchard. The rest of South
-- row 1 runs from position 2 to position 14 with position 1 missing, and
-- this is the orchard's lowest-numbered tree, so "a" is a typo for "1" and
-- renaming it fills the gap it left. South · 1 · 1 is vacant, so this
-- cannot collide with the address uniqueness constraint.
--
-- Matched on the tree's permanent id rather than on the label: "a" is a
-- plausible row name somewhere else, and this is a fix for one tree, not
-- for every row that happens to be called that.

UPDATE trees
SET row_id = '1'
WHERE tree_id = 'TA-002-0001'
  AND btrim(COALESCE(row_id, '')) = 'a';
