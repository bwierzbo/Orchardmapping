-- Every tree filed under the right fruit, and two names settled.
--
-- An audit of all 705 trees against the variety library turned up three
-- things. Two are corrections the owner asked for; one is left alone on
-- purpose and reported instead.
--
-- 1. A HUNDRED AND EIGHTEEN TREES HAD NO SPECIES AT ALL.
--
-- fruit_type was added in migration 016 and backfilled to 'apple' for what
-- existed then; everything entered since could be left blank, and was. The
-- library knows what these are -- Kingston Black is an apple whether or not
-- anybody said so on the tree -- so the species is taken from there. This
-- matters more than tidiness now: the harvest model anchors each fruit to
-- its own species' bloom, and a pear with no species was being counted from
-- the apple bloom, a fortnight out.
UPDATE trees t
SET fruit_type = va.fruit_type
FROM variety_attributes va
WHERE va.site_id IS NULL
  AND lower(btrim(va.variety)) = lower(btrim(t.variety))
  AND btrim(COALESCE(t.fruit_type, '')) = ''
  AND btrim(COALESCE(va.fruit_type, '')) <> '';

-- 2. "KING" IS TOMPKINS KING.
--
-- The owner writes King for it. The library carried both: a fully described
-- Tompkins King -- dessert, bloom group 3, medium acid, low tannin, high
-- confidence -- and a bare King stub with nothing but a low confidence flag.
-- One variety, two rows, and a tree pointing at the emptier one.
--
-- King David is a DIFFERENT apple (Arkansas, 1893) and is matched exactly so
-- it cannot be caught by this.
UPDATE trees SET variety = 'Tompkins King'
WHERE btrim(variety) = 'King';

DELETE FROM variety_attributes
WHERE site_id IS NULL AND btrim(variety) = 'King';

-- 3. THE "CONCORD PEAR" IS A CONCORDE.
--
-- There is no pear cultivar called Concord. Concorde is Conference x Doyenne
-- du Comice, raised at East Malling from a 1968 pollination and selected in
-- 1977; WSU carries it and OSU lists it for the western Pacific Northwest.
-- Comice, one of its two parents, stands one row away in the same block.
UPDATE trees SET variety = 'Concorde'
WHERE btrim(variety) = 'Concord pear';

UPDATE variety_attributes SET variety = 'Concorde'
WHERE site_id IS NULL AND btrim(variety) = 'Concord pear';

UPDATE variety_harvest_targets SET variety = 'Concorde'
WHERE btrim(variety) = 'Concord pear';

-- NOT CHANGED, AND REPORTED INSTEAD: tree PPN-001-0065 at Prairie Pride is
-- a Liberty recorded as a pear. Liberty is an apple -- scab-immune, Vf, from
-- Geneva, New York -- and the library says so. Either the species is wrong
-- or the variety is, and only somebody standing at the tree can say which.
-- Guessing would file a real tree under a fruit it is not.
