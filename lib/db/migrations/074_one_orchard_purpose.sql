-- Migration: one answer to "what is this fruit for".
--
-- 040 added fruit_purpose for the nutrition page (cider / dessert / baking /
-- mixed, default cider) and 066 added harvest_purpose for the picking
-- windows (cider / fresh, default fresh). Two columns asking the same
-- question drifted apart: by October 2026 six orchards said cider on one
-- and fresh on the other, and were being given fresh windows ten days early
-- for cider fruit. Only the nutrition page could change either one.
--
-- fruit_purpose stays -- it is the finer answer and has a screen -- and the
-- harvest target is derived from it in code (harvestPurposeFor). Before
-- this ran, every orchard but the test one had harvest_purpose = 'cider'
-- and fruit_purpose = 'cider', so dropping the column loses nothing.

ALTER TABLE orchards DROP CONSTRAINT IF EXISTS orchards_harvest_purpose_check;
ALTER TABLE orchards DROP COLUMN IF EXISTS harvest_purpose;

ALTER TABLE orchards DROP CONSTRAINT IF EXISTS orchards_fruit_purpose_check;
ALTER TABLE orchards ADD CONSTRAINT orchards_fruit_purpose_check
  CHECK (fruit_purpose IN ('cider', 'dessert', 'baking', 'mixed'));

COMMENT ON COLUMN orchards.fruit_purpose IS
  'What the fruit here is for. Sets the nutrition notes and, via harvestPurposeFor, the picking target and window. Default cider.';
